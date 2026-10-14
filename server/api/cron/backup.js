import crypto from 'node:crypto';
import { createDatabaseBackup } from '../_lib/backup.js';
function equalSecret(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const expected = process.env.CRON_SECRET;
  const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!expected || !equalSecret(auth, expected)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const backup = await createDatabaseBackup('daily');
    return res.status(201).json({ ok: true, path: backup.path, createdAt: backup.createdAt, counts: backup.counts });
  } catch {
    return res.status(500).json({ error: 'Scheduled backup failed. Check the private backups bucket and migration.' });
  }
}
