import crypto from 'node:crypto';
import { select, update, insert } from '../../_lib/db.js';
import { normalizePhone } from '../../_lib/phone.js';
import { verifyPhoneOtp } from '../../_lib/twilio-verify.js';
import { createSession, setSessionCookie } from '../../_lib/session.js';

function digest(value) {
  const secret = process.env.GML_SESSION_SECRET;
  if (!secret) throw new Error('Session configuration is missing');
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim().slice(0, 100);
}
function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  return res.status(status).json(body);
}
function publicUser(user) {
  const safe = { ...user };
  delete safe.password_hash;
  safe.modules = safe.modules || [];
  safe.completedModules = safe.completed_modules || [];
  safe.sessionDuration = safe.session_duration || '—';
  safe.lastLogin = safe.last_login || '—';
  delete safe.completed_modules;
  delete safe.session_duration;
  delete safe.last_login;
  return safe;
}
function detectBrowser(agent) {
  if (/Edg\//.test(agent)) return 'Edge';
  if (/Chrome\//.test(agent)) return 'Chrome';
  if (/Firefox\//.test(agent)) return 'Firefox';
  if (/Safari\//.test(agent) && !/Chrome\//.test(agent)) return 'Safari';
  return 'Other';
}
function detectOS(agent) {
  if (/Windows/i.test(agent)) return 'Windows';
  if (/Mac OS|Macintosh/i.test(agent)) return 'macOS';
  if (/Android/i.test(agent)) return 'Android';
  if (/iPhone|iPad|iOS/i.test(agent)) return 'iOS';
  if (/Linux/i.test(agent)) return 'Linux';
  return 'Other';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });
  try {
    const phone = normalizePhone(req.body?.phone);
    const code = String(req.body?.code || '').trim();
    if (!phone || !/^\d{4,10}$/.test(code)) return respond(res, 400, { error: 'Enter the phone number and verification code.' });

    const phoneHash = digest(`phone:${phone}`);
    const ipHash = digest(`ip:${clientIp(req)}`);
    const since = encodeURIComponent(new Date(Date.now() - 15 * 60 * 1000).toISOString());
    const [phoneAttempts, ipAttempts] = await Promise.all([
      select('otp_verify_events', `select=id,created_at&phone_hash=eq.${phoneHash}&created_at=gte.${since}&order=created_at.desc&limit=7`),
      select('otp_verify_events', `select=id,created_at&ip_hash=eq.${ipHash}&created_at=gte.${since}&order=created_at.desc&limit=21`)
    ]);
    if ((phoneAttempts || []).length >= 6 || (ipAttempts || []).length >= 20) {
      return respond(res, 429, { error: 'Too many verification attempts. Request a new code later or contact support.' });
    }
    // Store hashed identifiers only; never store the submitted verification code.
    await insert('otp_verify_events', { phone_hash: phoneHash, ip_hash: ipHash });

    let check;
    try { check = await verifyPhoneOtp(phone, code); }
    catch (error) {
      if (error.code === 'OTP_NOT_CONFIGURED') return respond(res, 503, { error: 'Phone OTP is not configured yet. Ask the administrator to finish the SMS setup.' });
      if (error.status === 429 || error.providerCode === 60203) return respond(res, 429, { error: 'Too many verification attempts. Wait before trying again.' });
      return respond(res, 502, { error: 'We could not verify this code right now. Please try again.' });
    }
    if (check.status !== 'approved') return respond(res, 401, { error: 'That code is incorrect or expired. Request a new code and try again.' });

    const candidates = await select('users', 'select=id,name,email,role,status,phone,state,city,specialization,experience,degree,hospital,registration_number,last_login,session_duration,modules,completed_modules,onboarded,score,streak,created_at&role=eq.doctor&status=eq.active&limit=5000');
    const user = (candidates || []).find((item) => normalizePhone(item.phone) === phone);
    if (!user) return respond(res, 401, { error: 'This doctor account is inactive or not registered. Please contact the administrator.' });

    const lastLogin = new Date().toISOString();
    await update('users', `id=eq.${encodeURIComponent(user.id)}`, { last_login: lastLogin, updated_at: lastLogin });
    try {
      const agent = String(req.headers['user-agent'] || 'Unknown').slice(0, 180);
      await insert('logs', { user_id: user.id, event: 'OTP Login', module: '—', device: agent });
      await insert('analytics_events', {
        user_id: user.id, session_id: null, event_name: 'login', route: '/doctor-dashboard.html',
        device_type: /tablet|ipad/i.test(agent) ? 'Tablet' : /mobile|android|iphone/i.test(agent) ? 'Mobile' : 'Desktop',
        browser: detectBrowser(agent), os: detectOS(agent), payload: { method: 'phone_otp' }
      });
    } catch { /* Analytics must not block a valid sign-in. */ }
    user.last_login = lastLogin;
    const safe = publicUser(user);
    setSessionCookie(res, createSession(safe));
    return respond(res, 200, { user: safe });
  } catch {
    return respond(res, 500, { error: 'Unable to complete sign-in. Please try again.' });
  }
}
