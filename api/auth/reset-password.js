import crypto from 'node:crypto';
import { select, update, insert } from '../_lib/db.js';
import { hashPassword } from '../_lib/password.js';

function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  return res.status(status).json(body);
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });
  try {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');
    const confirmPassword = String(req.body?.confirmPassword || '');
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return respond(res, 400, { error: 'This reset link is invalid. Request a fresh link.' });
    if (password.length < 10 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return respond(res, 400, { error: 'Use at least 10 characters, including at least one letter and one number.' });
    if (password !== confirmPassword) return respond(res, 400, { error: 'Passwords do not match.' });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokens = await select('password_reset_tokens', `select=id,user_id,expires_at,used_at&token_hash=eq.${tokenHash}&limit=1`);
    const record = tokens?.[0];
    if (!record || record.used_at || new Date(record.expires_at).getTime() <= Date.now()) return respond(res, 410, { error: 'This reset link has expired or was already used. Request a new one.' });
    const users = await select('users', `select=id,name,email,role,status&id=eq.${encodeURIComponent(record.user_id)}&limit=1`);
    const user = users?.[0];
    if (!user || user.status !== 'active' || !['doctor', 'admin'].includes(user.role)) return respond(res, 410, { error: 'This account is unavailable. Request a new link or contact the administrator.' });
    const consumed = await update('password_reset_tokens', `id=eq.${encodeURIComponent(record.id)}&used_at=is.null`, { used_at: new Date().toISOString() });
    if (!Array.isArray(consumed) || consumed.length !== 1) return respond(res, 410, { error: 'This reset link was already used. Request a new one.' });
    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();
    const changed = await update('users', `id=eq.${encodeURIComponent(user.id)}`, { password_hash: passwordHash, password_set_at: now, updated_at: now });
    if (!Array.isArray(changed) || changed.length !== 1) return respond(res, 500, { error: 'Password could not be updated. Request a new reset link.' });
    try {
      await Promise.all([
        insert('logs', { user_id: user.id, event: 'Password Reset Completed', module: 'account', device: String(req.headers['user-agent'] || 'Unknown').slice(0, 180) }),
        insert('analytics_events', { user_id: user.id, event_name: 'password_reset_completed', route: '/reset-password.html', payload: { method: 'email_reset_link' }, device_type: /mobile|android|iphone/i.test(String(req.headers['user-agent'] || '')) ? 'Mobile' : 'Desktop' })
      ]);
    } catch {}
    return respond(res, 200, { ok: true, message: 'Your password has been reset. You can now sign in with your new password.' });
  } catch (error) {
    console.error('Reset password failed:', error?.status || '', error?.message || 'Unknown error');
    return respond(res, 500, { error: 'Unable to reset the password right now. Request a fresh link and try again.' });
  }
}
