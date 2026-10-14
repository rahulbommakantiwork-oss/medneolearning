import crypto from 'node:crypto';
import { requireSession } from '../../server/lib/session.js';
import { supabaseFetch } from '../../server/lib/db.js';

const ALLOWED_MODULES = new Set(['m1', 'm2', 'm3']);
const ALLOWED_EXTENSIONS = new Set(['.pdf']);
function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  return res.status(status).json(body);
}
function safeFilename(value) {
  const leaf = String(value || 'module-presentation').split(/[\\/]/).pop();
  return leaf.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-120) || 'module-presentation';
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });
  const session = requireSession(req, res, 'admin');
  if (!session) return;
  try {
    const moduleId = String(req.body?.moduleId || '');
    const filename = safeFilename(req.body?.filename);
    const size = Number(req.body?.size) || 0;
    const suppliedType = String(req.body?.contentType || '').slice(0, 160).toLowerCase();
    const contentType = 'application/pdf';
    const extension = filename.includes('.') ? `.${filename.split('.').pop().toLowerCase()}` : '';
    if (!ALLOWED_MODULES.has(moduleId)) return respond(res, 400, { error: 'Choose Module 1, 2 or 3.' });
    if (!ALLOWED_EXTENSIONS.has(extension) || (suppliedType && suppliedType !== 'application/pdf' && suppliedType !== 'application/octet-stream')) return respond(res, 400, { error: 'Upload a PDF file (.pdf) only.' });
    if (size < 1 || size > 100 * 1024 * 1024) return respond(res, 413, { error: 'Presentation must be no larger than 100 MB.' });

    const storagePath = `${moduleId}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${filename}`;
    const pathPart = storagePath.split('/').map(encodeURIComponent).join('/');
    const result = await supabaseFetch(`/storage/v1/object/upload/sign/modules/${pathPart}`, {
      method: 'POST',
      headers: { 'x-upsert': 'false' },
      body: '{}'
    });
    const rawUrl = result?.url || result?.signedURL || result?.signedUrl;
    if (!rawUrl) return respond(res, 502, { error: 'Supabase did not return a signed upload URL. Check that the private Storage bucket named modules exists.' });
    const baseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
    const uploadUrl = /^https?:\/\//i.test(rawUrl)
      ? rawUrl
      : new URL(rawUrl.startsWith('/storage/v1/') ? rawUrl : `/storage/v1${rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`}`, `${baseUrl}/`).toString();
    return respond(res, 200, {
      uploadUrl,
      storagePath,
      publicId: `presentation_${moduleId}_${crypto.randomBytes(10).toString('hex')}`,
      moduleId,
      filename,
      contentType,
      size
    });
  } catch (error) {
    console.error('Module upload URL error:', error?.status || '', error?.message || 'Unknown error');
    return respond(res, 500, { error: 'Unable to prepare upload. Confirm the private Supabase Storage bucket named modules exists and the latest schema is applied.' });
  }
}
