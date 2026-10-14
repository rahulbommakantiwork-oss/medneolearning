import crypto from 'node:crypto';
import { select, update, insert } from '../_lib/db.js';
import { hashPassword } from '../_lib/password.js';
import { createSession, setSessionCookie } from '../_lib/session.js';

function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache'); res.setHeader('Expires', '0');
  return res.status(status).json(body);
}
function detectDevice(agent) { return /tablet|ipad/i.test(agent) ? 'Tablet' : /mobile|android|iphone/i.test(agent) ? 'Mobile' : 'Desktop'; }
function detectBrowser(agent) { if (/Edg\//.test(agent)) return 'Edge'; if (/Chrome\//.test(agent)) return 'Chrome'; if (/Firefox\//.test(agent)) return 'Firefox'; if (/Safari\//.test(agent) && !/Chrome\//.test(agent)) return 'Safari'; return 'Other'; }
function detectOS(agent) { if (/Windows/i.test(agent)) return 'Windows'; if (/Mac OS|Macintosh/i.test(agent)) return 'macOS'; if (/Android/i.test(agent)) return 'Android'; if (/iPhone|iPad|iOS/i.test(agent)) return 'iOS'; if (/Linux/i.test(agent)) return 'Linux'; return 'Other'; }
function publicUser(user) {
  const safe = { ...user };
  delete safe.password_hash; safe.modules = safe.modules || []; safe.completedModules = safe.completed_modules || [];
  safe.sessionDuration = safe.session_duration || '—'; safe.lastLogin = safe.last_login || '—';
  delete safe.completed_modules; delete safe.session_duration; delete safe.last_login; return safe;
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });
  try {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');
    const confirm = String(req.body?.confirmPassword || '');
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return respond(res, 400, { error: 'This invitation link is invalid. Ask the programme administrator to send a new one.' });
    if (password.length < 10 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return respond(res, 400, { error: 'Use at least 10 characters, including at least one letter and one number.' });
    if (password !== confirm) return respond(res, 400, { error: 'Passwords do not match.' });

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const rows = await select('password_setup_tokens', `select=id,doctor_id,expires_at,used_at&token_hash=eq.${tokenHash}&limit=1`);
    const invite = rows?.[0];
    if (!invite || invite.used_at || new Date(invite.expires_at).getTime() <= Date.now()) return respond(res, 410, { error: 'This invitation link has expired or has already been used. Ask the administrator to send a new link.' });
    const doctors = await select('users', `select=id,name,email,phone,role,status,password_hash,last_login,session_duration,modules,completed_modules,onboarded,score,streak,degree,city,state,specialization,experience,hospital,registration_number,created_at,password_set_at,phone_verified&id=eq.${encodeURIComponent(invite.doctor_id)}&role=eq.doctor&limit=1`);
    const doctor = doctors?.[0];
    if (!doctor || doctor.status !== 'active') return respond(res, 404, { error: 'This doctor account is inactive or unavailable. Contact the administrator.' });
    if (doctor.password_set_at) return respond(res, 409, { error: 'A password has already been set for this account. Please sign in.' });

    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();
    const consumed = await update('password_setup_tokens', `id=eq.${encodeURIComponent(invite.id)}&used_at=is.null`, { used_at: now });
    if (!Array.isArray(consumed) || consumed.length !== 1) return respond(res, 410, { error: 'This invitation link has already been used. Please sign in or ask for a new link.' });
    const updated = await update('users', `id=eq.${encodeURIComponent(doctor.id)}&password_set_at=is.null`, { password_hash: passwordHash, password_set_at: now, updated_at: now });
    if (!Array.isArray(updated) || updated.length !== 1) return respond(res, 409, { error: 'A password may already have been set. Try signing in or contact the administrator.' });
    const user = { ...doctor, password_hash: passwordHash, password_set_at: now };
    const agent = String(req.headers['user-agent'] || 'Unknown').slice(0, 180);
    try {
      await Promise.all([
        insert('logs', { user_id: user.id, event: 'Doctor Password Set', module: 'account', device: agent }),
        insert('analytics_events', { user_id: user.id, session_id: null, event_name: 'doctor_password_set', route: '/set-password.html', device_type: detectDevice(agent), browser: detectBrowser(agent), os: detectOS(agent), payload: { method: 'one_time_invitation_link' } })
      ]);
    } catch {}
    const safe = publicUser(user);
    setSessionCookie(res, createSession(safe));
    return respond(res, 200, { user: safe, message: 'Password saved securely. Your account is ready.' });
  } catch {
    return respond(res, 500, { error: 'Unable to set your password right now. Request a new invitation and try again.' });
  }
}
