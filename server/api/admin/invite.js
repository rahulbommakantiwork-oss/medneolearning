import crypto from 'node:crypto';
import { requireSession } from '../../server/lib/session.js';
import { select, update, insert } from '../../server/lib/db.js';
import { sendPasswordSetupEmail } from '../../server/lib/email.js';

function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  return res.status(status).json(body);
}
function portalOrigin(req) {
  const envOrigin = String(process.env.APP_ORIGIN || '').trim().replace(/\/$/, '');
  const configured = envOrigin && !/YOUR-VERCEL-DOMAIN/i.test(envOrigin) ? envOrigin : '';
  const host = String(req.headers.host || 'localhost:3000');
  const localHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
  const origin = configured || `${localHost ? 'http' : 'https'}://${host}`;
  const localHttp = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) && process.env.NODE_ENV !== 'production' && process.env.VERCEL !== '1';
  if (!/^https:\/\//i.test(origin) && !localHttp) throw new Error('Configure APP_ORIGIN with the public HTTPS portal URL before sending invitations.');
  return origin;
}
export default async function handler(req, res) {
  const session = requireSession(req, res, 'admin');
  if (!session) return;
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });
  try {
    const doctorId = String(req.body?.doctorId || '').trim();
    if (!doctorId) return respond(res, 400, { error: 'Choose a saved doctor profile to invite.' });
    const rows = await select('users', `select=id,name,email,role,status,password_set_at&id=eq.${encodeURIComponent(doctorId)}&role=eq.doctor&limit=1`);
    const doctor = rows?.[0];
    if (!doctor || doctor.status !== 'active') return respond(res, 404, { error: 'Active doctor profile not found.' });
    if (!doctor.name || !doctor.email) return respond(res, 400, { error: 'Doctor name and email are required.' });

    const origin = portalOrigin(req);
    let inviteUrl = `${origin}/index.html`;
    let expiresAt = null;
    const needsSetup = !doctor.password_set_at;
    if (needsSetup) {
      const now = new Date().toISOString();
      await update('password_setup_tokens', `doctor_id=eq.${encodeURIComponent(doctor.id)}&used_at=is.null`, { used_at: now });
      const token = crypto.randomBytes(32).toString('base64url');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await insert('password_setup_tokens', { doctor_id: doctor.id, token_hash: tokenHash, created_at: now, expires_at: expiresAt, used_at: null });
      inviteUrl = `${origin}/set-password.html?token=${encodeURIComponent(token)}`;
    }
    const emailResult = needsSetup
      ? await sendPasswordSetupEmail({ email: doctor.email, name: doctor.name, setupUrl: inviteUrl })
      : { status: 'already_set' };

    try { await insert('logs', { user_id: session.id, event: needsSetup ? `Password setup link ${emailResult.status}` : 'Doctor invitation viewed', module: doctor.name, device: String(req.headers['user-agent'] || 'Unknown').slice(0, 180) }); } catch {}
    const devLinkAllowed = process.env.NODE_ENV !== 'production' && process.env.VERCEL !== '1' && process.env.DEV_SHOW_SETUP_LINK === 'true';
    if (needsSetup && emailResult.status !== 'sent' && !devLinkAllowed) {
      return respond(res, 502, { error: emailResult.status === 'not_configured' ? 'Email delivery is not configured. Configure RESEND_API_KEY and RESEND_FROM_EMAIL, then retry the setup link.' : 'The setup email could not be sent. Retry after checking your email provider configuration.', saved: true, passwordSetupRequired: true, expiresAt });
    }
    return respond(res, 200, { ok: true, emailStatus: needsSetup ? emailResult.status : 'already_set', message: needsSetup ? (emailResult.status === 'sent' ? 'A single-use password setup link was emailed. It expires in 24 hours.' : 'Email is not configured. Use the local setup link shown by this development server.') : 'This doctor already has a password. They can sign in using their email and password.', passwordSetupRequired: needsSetup, expiresAt, ...(needsSetup && devLinkAllowed ? { setupUrl: inviteUrl } : {}) });
  } catch (error) {
    console.error('Password setup invitation failed:', error?.status || '', error?.message || 'Unknown error');
    return respond(res, 500, { error: error.message || 'Unable to send the invitation. Check the schema and email configuration.' });
  }
}
