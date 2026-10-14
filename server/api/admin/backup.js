import { requireSession } from '../_lib/session.js';
import { createDatabaseBackup } from '../_lib/backup.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const session = requireSession(req, res, 'admin');
  if (!session) return;
  try {
    const backup = await createDatabaseBackup('manual');
    return res.status(201).json({ ok: true, ...backup, upload: undefined });
  } catch {
    return res.status(500).json({ error: 'Backup failed. Confirm the private backups bucket and database migration are configured.' });
  }
}
