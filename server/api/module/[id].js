import { Readable } from 'node:stream';
import { requireSession } from '../../server/lib/session.js';
import { select, supabaseFetch } from '../../server/lib/db.js';

function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  return res.status(status).json(body);
}
function queryValue(req, key) {
  if (req.query && req.query[key] !== undefined) return String(req.query[key]);
  try { return new URL(req.url, 'http://localhost').searchParams.get(key) || ''; } catch { return ''; }
}
function makeSignedUrl(signedPath) {
  const path = String(signedPath || '');
  if (/^https?:\/\//i.test(path)) return path;
  const base = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  if (!base) throw new Error('Missing environment variable: SUPABASE_URL');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized.startsWith('/storage/v1/') ? `${base}${normalized}` : `${base}/storage/v1${normalized}`;
}
async function proxyPdf(req, res, file, signedUrl) {
  const extension = String(file.original_filename || file.filename || '').split('.').pop().toLowerCase();
  const mime = String(file.mime_type || '').toLowerCase();
  if (extension !== 'pdf' && !mime.includes('pdf')) return respond(res, 415, { error: 'This resource is not a PDF.' });
  const forwardHeaders = {};
  if (req.headers?.range) forwardHeaders.Range = req.headers.range;
  if (req.headers?.['if-range']) forwardHeaders['If-Range'] = req.headers['if-range'];
  const upstream = await fetch(signedUrl, { method: 'GET', headers: forwardHeaders, signal: AbortSignal.timeout(45000) });
  if (!upstream.ok && upstream.status !== 206) {
    const message = `Supabase Storage returned HTTP ${upstream.status} while reading the PDF.`;
    return respond(res, 502, { error: message });
  }
  res.status(upstream.status);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="medneo-module.pdf"');
  res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const contentLength = upstream.headers.get('content-length');
  const contentRange = upstream.headers.get('content-range');
  const etag = upstream.headers.get('etag');
  if (contentLength) res.setHeader('Content-Length', contentLength);
  if (contentRange) res.setHeader('Content-Range', contentRange);
  if (etag) res.setHeader('ETag', etag);
  if (req.method === 'HEAD' || !upstream.body) return res.end();
  // Stream the upstream byte-range response directly; do not buffer the complete PDF in memory.
  const nodeStream = Readable.fromWeb(upstream.body);
  nodeStream.on('error', (error) => {
    console.error('PDF stream failed:', error?.message || 'Unknown stream error');
    if (!res.headersSent) res.status(502);
    res.end();
  });
  nodeStream.pipe(res);
  return undefined;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'HEAD'].includes(req.method)) return respond(res, 405, { error: 'Method not allowed' });
  const session = requireSession(req, res);
  if (!session) return;
  const id = req.query?.id || (() => {
    const parts = String(req.url || '').split('?')[0].split('/');
    try { return decodeURIComponent(parts[parts.length - 1] || ''); } catch { return ''; }
  })();
  if (!id) return respond(res, 400, { error: 'Missing presentation ID' });
  const viewMode = ['1', 'true', 'json'].includes(queryValue(req, 'view').toLowerCase());
  const streamMode = ['1', 'true'].includes(queryValue(req, 'stream').toLowerCase());
  const downloadMode = ['1', 'true'].includes(queryValue(req, 'download').toLowerCase());
  try {
    const rows = await select('module_files', `select=id,public_id,storage_path,owner_user_id,module_id,active,original_filename,mime_type,file_size&public_id=eq.${encodeURIComponent(id)}&active=eq.true&limit=1`);
    const file = rows?.[0];
    if (!file) return respond(res, 404, { error: 'Presentation not found. Ask the administrator to publish the file again.' });
    if (session.role !== 'admin') {
      if (file.module_id) {
        const content = await select('app_content', 'select=payload&key=eq.main&limit=1');
        const module = (content?.[0]?.payload?.modules || []).find((item) => String(item.id) === String(file.module_id));
        if (!module || module.status !== 'active') return respond(res, 403, { error: 'This presentation has not been published.' });
      } else if (file.owner_user_id !== session.id) {
        return respond(res, 403, { error: 'You do not have access to this presentation.' });
      }
    }
    const encodedPath = String(file.storage_path || '').split('/').map(encodeURIComponent).join('/');
    const signed = await supabaseFetch(`/storage/v1/object/sign/modules/${encodedPath}`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ expiresIn: 3600 })
    });
    const signedPath = signed?.signedURL || signed?.signedUrl || signed?.path;
    if (!signedPath) return respond(res, 502, { error: 'Supabase could not create a temporary presentation link. Confirm the private Storage bucket named modules exists.' });
    const signedUrl = makeSignedUrl(signedPath);
    if (streamMode) return await proxyPdf(req, res, file, signedUrl);
    const result = {
      ok: true,
      url: signedUrl,
      id: file.public_id,
      moduleId: file.module_id,
      filename: file.original_filename || 'Module presentation',
      mimeType: file.mime_type || 'application/octet-stream',
      size: Number(file.file_size) || 0,
      expiresInSeconds: 3600
    };
    if (viewMode) return respond(res, 200, result);
    if (downloadMode) res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`);
    return res.redirect(302, result.url);
  } catch (error) {
    console.error('[api/module/:id] open failed', { status: error?.status || null, message: error?.message || 'Unknown server error' });
    return respond(res, 500, {
      error: process.env.NODE_ENV === 'production'
        ? 'Unable to open this presentation. Check the module schema, private Storage bucket and server configuration.'
        : `Unable to open presentation: ${error?.message || 'Unknown server error'}`,
      code: error?.status || 'PRESENTATION_OPEN_FAILED'
    });
  }
}
