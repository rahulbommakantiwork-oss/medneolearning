import { requireSession } from '../../server/lib/session.js';
import { select, insert, update } from '../../server/lib/db.js';

const ALLOWED_MODULES = new Set(['m1', 'm2', 'm3']);
function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  return res.status(status).json(body);
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });
  const session = requireSession(req, res, 'admin');
  if (!session) return;
  try {
    const { moduleId, storagePath, publicId } = req.body || {};
    const filename = String(req.body?.filename || '').slice(0, 160);
    const contentType = 'application/pdf';
    const size = Math.floor(Number(req.body?.size) || 0);
    if (!ALLOWED_MODULES.has(String(moduleId)) || !String(storagePath || '').startsWith(`${moduleId}/`) || !/^presentation_(m1|m2|m3)_[a-f0-9]{20}$/.test(String(publicId || '')) || !filename || !/\.pdf$/i.test(filename) || !String(storagePath || '').toLowerCase().endsWith('.pdf') || size < 1 || size > 100 * 1024 * 1024) {
      return respond(res, 400, { error: 'Only valid PDF files up to 100 MB can be published.' });
    }
    const contentRows = await select('app_content', 'select=key,payload&key=eq.main&limit=1');
    if (!contentRows?.[0]?.payload) return respond(res, 409, { error: 'Application content is not initialized. Run the content seed after applying the migration.' });
    const payload = contentRows[0].payload;
    const modules = Array.isArray(payload.modules) ? payload.modules : [];
    const target = modules.find((module) => String(module.id) === String(moduleId));
    if (!target) return respond(res, 404, { error: 'Module not found in live content.' });

    const now = new Date().toISOString();
    payload.modules = modules.map((module) => ['m1', 'm2', 'm3'].includes(String(module.id)) ? { ...module, status: 'active' } : module);
    const contentUpdate = await update('app_content', 'key=eq.main', { payload, updated_at: now });
    if (!Array.isArray(contentUpdate) || contentUpdate.length === 0) return respond(res, 500, { error: 'The module is valid, but its published status could not be saved. Try again.' });
    await insert('module_files', {
      public_id: publicId, storage_path: storagePath, owner_user_id: session.id, active: true,
      module_id: moduleId, original_filename: filename, mime_type: contentType, file_size: size,
      uploaded_by: session.id, created_at: now, updated_at: now
    });
    await update('module_files', `module_id=eq.${encodeURIComponent(moduleId)}&active=eq.true&public_id=neq.${encodeURIComponent(publicId)}`, { active: false, updated_at: now });
    try { await insert('logs', { user_id: session.id, event: 'Module presentation published', module: moduleId, device: String(req.headers['user-agent'] || 'Unknown').slice(0, 180) }); } catch {}
    return respond(res, 201, { ok: true, message: `${filename} is now available in ${target.title}.`, moduleId, presentation: { id: publicId, filename, mimeType: contentType, size, uploadedAt: now } });
  } catch (error) {
    console.error('Module publish error:', error?.status || '', error?.message || 'Unknown error');
    return respond(res, 500, { error: 'The file uploaded, but it could not be published. Check the module_files schema migration and try again.' });
  }
}
