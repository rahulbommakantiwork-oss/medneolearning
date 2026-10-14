import { requireSession } from '../_lib/session.js';
import { update, insert } from '../_lib/db.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  const session = requireSession(req, res, 'admin');
  if (!session) return;
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { id, status } = req.body || {};
    if (!id || !['active', 'inactive'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const rows = await update('users', `id=eq.${encodeURIComponent(id)}&role=eq.doctor`, { status, updated_at: new Date().toISOString() });
    if (!rows?.length) return res.status(404).json({ error: 'Doctor not found' });
    try { await insert('logs', { user_id: session.id, event: status === 'active' ? 'Doctor Activated' : 'Doctor Deactivated', module: id, device: String(req.headers['user-agent'] || 'Unknown').slice(0, 180) }); } catch {}
    const safe = { ...rows[0] };
    delete safe.password_hash;
    return res.status(200).json({ user: safe });
  } catch {
    return res.status(500).json({ error: 'Unable to update doctor status.' });
  }
}
