import crypto from 'node:crypto';
import { select, insert, update } from '../_lib/db.js';
import { sendPasswordResetEmail } from '../../server/lib/email.js';

function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  return res.status(status).json(body);
}
function digest(value) {
  const secret = process.env.GML_SESSION_SECRET;
  if (!secret) throw new Error('Session configuration is missing');
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim().slice(0, 100);
}
const genericMessage = 'If an active account uses that email address, a password reset link will be sent shortly.';
export default async function handler(req, res) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return respond(res, 200, { ok: true, message: genericMessage });
    const since = encodeURIComponent(new Date(Date.now() - 60 * 60 * 1000).toISOString());
    const identifierHash = digest(`password-reset-email:${email}`);
    const ipHash = digest(`password-reset-ip:${clientIp(req)}`);
    const [identifierAttempts, ipAttempts] = await Promise.all([
      select('auth_attempts', `select=id&identifier_hash=eq.${identifierHash}&created_at=gte.${since}&limit=6`),
      select('auth_attempts', `select=id&ip_hash=eq.${ipHash}&created_at=gte.${since}&limit=11`)
    ]);
    if ((identifierAttempts || []).length >= 5 || (ipAttempts || []).length >= 10) return respond(res, 200, { ok: true, message: genericMessage });
    await insert('auth_attempts', { identifier_hash: identifierHash, ip_hash: ipHash });

    const users = await select('users', `select=id,name,email,status,role&email=eq.${encodeURIComponent(email)}&limit=1`);
    const user = users?.[0];
    if (!user || user.status !== 'active' || !['doctor', 'admin'].includes(user.role)) return respond(res, 200, { ok: true, message: genericMessage });

    const now = new Date().toISOString();
    await update('password_reset_tokens', `user_id=eq.${encodeURIComponent(user.id)}&used_at=is.null`, { used_at: now });
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await insert('password_reset_tokens', { user_id: user.id, token_hash: tokenHash, created_at: now, expires_at: expiresAt, used_at: null });
    const envOrigin = String(process.env.APP_ORIGIN || '').trim().replace(/\/$/, '');
    const origin = envOrigin && !/YOUR-VERCEL-DOMAIN/i.test(envOrigin) ? envOrigin : '';
    if (!origin || !/^https:\/\//i.test(origin)) {
      const localOrigin = `http://${String(req.headers.host || 'localhost:3000')}`;
      if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(localOrigin) || process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') {
        await update('password_reset_tokens', `token_hash=eq.${tokenHash}`, { used_at: new Date().toISOString() });
        return respond(res, 200, { ok: true, message: genericMessage });
      }
    }
    const resetOrigin = origin && /^https:\/\//i.test(origin) ? origin : `http://${String(req.headers.host || 'localhost:3000')}`;
    const resetUrl = `${resetOrigin}/reset-password.html?token=${encodeURIComponent(token)}`;
    const devLinkAllowed = process.env.NODE_ENV !== 'production' && process.env.VERCEL !== '1' && process.env.DEV_SHOW_RESET_LINK === 'true';
    const emailResult = await sendPasswordResetEmail({ email: user.email, name: user.name, resetUrl });
    if (emailResult.status !== 'sent' && !devLinkAllowed) await update('password_reset_tokens', `token_hash=eq.${tokenHash}`, { used_at: new Date().toISOString() });
    const body = { ok: true, message: genericMessage };
    if (devLinkAllowed && emailResult.status !== 'sent') body.developmentResetUrl = resetUrl;
    return respond(res, 200, body);
  } catch (error) {
    console.error('Forgot password handler failed:', error?.status || '', error?.message || 'Unknown error');
    // Avoid leaking whether an account exists even when a backend provider is not configured.
    return respond(res, 200, { ok: true, message: genericMessage });
  }
}
