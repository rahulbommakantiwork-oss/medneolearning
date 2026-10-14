import crypto from 'node:crypto';
import { select, insert, update } from '../_lib/db.js';
import { normalizePhone } from '../_lib/phone.js';
import { hashPassword } from '../_lib/password.js';
import { createSession, setSessionCookie } from '../_lib/session.js';
import { sendWelcomeEmail } from '../_lib/email.js';

function digest(value) {
  const secret = process.env.GML_SESSION_SECRET;
  if (!secret) throw new Error('Session configuration is missing');
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim().slice(0, 100);
}
function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache'); res.setHeader('Expires', '0');
  return res.status(status).json(body);
}
function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254; }
function detectDevice(agent) { return /tablet|ipad/i.test(agent) ? 'Tablet' : /mobile|android|iphone/i.test(agent) ? 'Mobile' : 'Desktop'; }
function detectBrowser(agent) { if (/Edg\//.test(agent)) return 'Edge'; if (/Chrome\//.test(agent)) return 'Chrome'; if (/Firefox\//.test(agent)) return 'Firefox'; if (/Safari\//.test(agent) && !/Chrome\//.test(agent)) return 'Safari'; return 'Other'; }
function detectOS(agent) { if (/Windows/i.test(agent)) return 'Windows'; if (/Mac OS|Macintosh/i.test(agent)) return 'macOS'; if (/Android/i.test(agent)) return 'Android'; if (/iPhone|iPad|iOS/i.test(agent)) return 'iOS'; if (/Linux/i.test(agent)) return 'Linux'; return 'Other'; }
function publicUser(row) {
  const safe = { ...row };
  delete safe.password_hash;
  safe.modules = safe.modules || []; safe.completedModules = safe.completed_modules || [];
  safe.sessionDuration = safe.session_duration || '—'; safe.lastLogin = safe.last_login || '—';
  delete safe.completed_modules; delete safe.session_duration; delete safe.last_login;
  return safe;
}

function configurationError() {
  if (!String(process.env.SUPABASE_URL || '').trim()) return 'SUPABASE_URL is missing in public/.env.';
  if (!String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()) return 'SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) is missing in public/.env.';
  if (String(process.env.GML_SESSION_SECRET || '').trim().length < 32) return 'GML_SESSION_SECRET must be set to a random secret with at least 32 characters in public/.env.';
  return '';
}

function safeRegistrationError(error, stage) {
  const code = String(error?.data?.code || error?.code || '');
  const status = Number(error?.status || 0);
  const detail = String(error?.data?.message || error?.message || '');
  if (/Missing environment variable|configuration is missing/i.test(detail)) {
    return { status: 503, message: 'Server setup is incomplete. Check SUPABASE_URL, SUPABASE_SECRET_KEY and GML_SESSION_SECRET in public/.env, then restart npm start.' };
  }
  if (['42P01', 'PGRST205'].includes(code) || /relation .* does not exist|table .* not found|could not find the table/i.test(detail)) {
    return { status: 503, message: 'Supabase database setup is incomplete. Run the latest supabase.sql in Supabase SQL Editor, then try again. Existing article content is not replaced by the migration.' };
  }
  if (['42703', 'PGRST204'].includes(code) || /column .* does not exist|could not find the .* column/i.test(detail)) {
    return { status: 503, message: 'The Supabase schema is out of date. Apply the latest additive supabase.sql migration, then restart the local server.' };
  }
  if (status === 401 || status === 403) {
    return { status: 503, message: 'Supabase rejected the server credentials. Check the server-only Supabase key in public/.env and restart npm start.' };
  }
  if (code === '23505' || status === 409) {
    return { status: 409, message: 'An account may already use these details. Sign in or contact the programme administrator.' };
  }
  if (status === 429) return { status: 429, message: 'Too many registration attempts. Please wait and try again.' };
  return { status: 500, message: `Unable to create your account right now. Check the local server terminal for the registration error at stage: ${stage}.` };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });
  let stage = 'server configuration';
  try {
    const configProblem = configurationError();
    if (configProblem) return respond(res, 503, { error: `Account service is not configured: ${configProblem}` });
    const body = req.body || {};
    const name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 160);
    const email = String(body.email || '').trim().toLowerCase();
    const phone = normalizePhone(body.phone);
    const degree = String(body.degree || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    const city = String(body.city || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    const state = String(body.state || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    const password = String(body.password || '');
    const confirmPassword = String(body.confirmPassword || '');
    const emailOptIn = body.sendWelcomeEmail === true;
    const consent = body.consent === true;

    if (name.length < 2) return respond(res, 400, { error: 'Enter your full name.' });
    if (!validEmail(email)) return respond(res, 400, { error: 'Enter a valid email address.' });
    if (!phone) return respond(res, 400, { error: 'Enter a valid mobile number, including its country code when outside India.' });
    if (!degree) return respond(res, 400, { error: 'Choose your degree. Select Other to enter a qualification not listed.' });
    if (!city || !state) return respond(res, 400, { error: 'Enter your city and state / Union Territory.' });
    if (password.length < 10 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return respond(res, 400, { error: 'Use at least 10 characters, including at least one letter and one number.' });
    }
    if (password !== confirmPassword) return respond(res, 400, { error: 'Passwords do not match.' });
    if (!consent) return respond(res, 400, { error: 'Please confirm your details and consent to programme activity tracking.' });

    stage = 'registration rate-limit check';
    const ip = clientIp(req);
    const emailHash = digest(`registration-email:${email}`);
    const ipHash = digest(`registration-ip:${ip}`);
    const since = encodeURIComponent(new Date(Date.now() - 60 * 60 * 1000).toISOString());
    const [emailAttempts, ipAttempts] = await Promise.all([
      select('registration_attempts', `select=id,created_at&email_hash=eq.${emailHash}&created_at=gte.${since}&order=created_at.desc&limit=6`),
      select('registration_attempts', `select=id,created_at&ip_hash=eq.${ipHash}&created_at=gte.${since}&order=created_at.desc&limit=11`)
    ]);
    if ((emailAttempts || []).length >= 5 || (ipAttempts || []).length >= 10) {
      return respond(res, 429, { error: 'Too many registration attempts. Please wait and try again.' });
    }
    await insert('registration_attempts', { email_hash: emailHash, ip_hash: ipHash });

    stage = 'checking existing account';
    const existingEmail = await select('users', `select=id&email=eq.${encodeURIComponent(email)}&limit=1`);
    if (existingEmail?.length) return respond(res, 409, { error: 'An account may already use these details. Sign in or contact the programme administrator.' });
    const existingPhone = await select('users', `select=id&phone=eq.${encodeURIComponent(phone)}&limit=1`);
    if (existingPhone?.length) return respond(res, 409, { error: 'An account may already use these details. Sign in or contact the programme administrator.' });

    stage = 'password hashing';
    // Never store or return the clear-text password. Only a unique salted scrypt hash is saved.
    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();
    const id = `u_${crypto.randomBytes(16).toString('hex')}`;
    stage = 'saving doctor profile to Supabase';
    const inserted = await insert('users', {
      id, name, email, phone, degree, city, state,
      role: 'doctor', status: 'active', password_hash: passwordHash,
      password_set_at: now, phone_verified: false,
      welcome_email_opt_in: emailOptIn, welcome_email_status: emailOptIn ? 'pending' : 'not_requested',
      modules: [], completed_modules: [], onboarded: true, score: 0, streak: 0,
      created_at: now, updated_at: now
    });
    const user = inserted?.[0];
    if (!user) throw new Error('Registration insert returned no user');

    const agent = String(req.headers['user-agent'] || 'Unknown').slice(0, 180);
    try {
      await Promise.all([
        insert('analytics_events', {
          user_id: user.id, session_id: null, event_name: 'doctor_registration', route: '/index.html',
          device_type: detectDevice(agent), browser: detectBrowser(agent), os: detectOS(agent),
          payload: { method: 'password_only', welcomeEmailOptIn: emailOptIn, phoneVerified: false }
        }),
        insert('logs', { user_id: user.id, event: 'Doctor self-registration (password)', module: 'registration', device: agent })
      ]);
    } catch { /* Do not fail account creation if the analytics table is behind the migration. */ }

    stage = 'optional welcome email';
    let emailStatus = 'not_requested';
    if (emailOptIn) {
      const result = await sendWelcomeEmail({ email, name, degree });
      emailStatus = result.status;
      try { await update('users', `id=eq.${encodeURIComponent(user.id)}`, { welcome_email_status: emailStatus, updated_at: new Date().toISOString() }); } catch {}
      user.welcome_email_status = emailStatus;
    }

    stage = 'creating secure session';
    const safe = publicUser(user);
    setSessionCookie(res, createSession(safe));
    const message = emailStatus === 'sent' ? 'Your account is ready. Your welcome email has been sent.'
      : emailStatus === 'failed' ? 'Your account is ready, but the optional welcome email could not be sent. You can continue to your dashboard.'
      : emailStatus === 'not_configured' ? 'Your account is ready. Email delivery is not configured yet, so no welcome email was sent.'
      : 'Your account is ready. Welcome to MedNeo.';
    return respond(res, 201, { user: safe, emailStatus, message });
  } catch (error) {
    // Log technical detail only on the server. Never log submitted passwords or the request body.
    console.error('[MedNeo registration error]', JSON.stringify({
      stage,
      status: error?.status || null,
      code: error?.data?.code || error?.code || null,
      message: String(error?.data?.message || error?.message || 'Unknown error').slice(0, 500),
      hint: String(error?.data?.hint || '').slice(0, 300)
    }));
    const mapped = safeRegistrationError(error, stage);
    return respond(res, mapped.status, { error: mapped.message });
  }
}
