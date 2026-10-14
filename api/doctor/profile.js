import { requireSession } from '../_lib/session.js';
import { selectAll, update, insert } from '../_lib/db.js';
import { normalizePhone } from '../_lib/phone.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });
  const session = requireSession(req, res, 'doctor');
  if (!session) return;
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim().slice(0, 160);
    const phone = normalizePhone(body.phone);
    if (!name || !phone) return res.status(400).json({ error: 'Full name and a valid mobile number are required.' });
    const users = await selectAll('users', 'select=id,phone,role&role=eq.doctor', { maxRows: 20000 });
    const currentUser = users.find((user) => user.id === session.id);
    if (!currentUser) return res.status(404).json({ error: 'Doctor profile not found.' });
    if (normalizePhone(currentUser.phone) !== phone) {
      return res.status(400).json({ error: 'For security, changing the sign-in mobile requires administrator verification. Your registered number was not changed.' });
    }
    if (users.some((user) => user.id !== session.id && normalizePhone(user.phone) === phone)) {
      return res.status(409).json({ error: 'This phone number is already registered to another doctor.' });
    }
    const patch = {
      name, phone: currentUser.phone,
      specialization: String(body.specialization || '').trim().slice(0, 160) || null,
      degree: String(body.degree || '').trim().slice(0, 120) || null,
      hospital: String(body.hospital || '').trim().slice(0, 180) || null,
      registration_number: String(body.registrationNumber || '').trim().slice(0, 100) || null,
      experience: String(body.experience || '').trim().slice(0, 80) || null,
      state: String(body.state || '').trim().slice(0, 100) || null,
      city: String(body.city || '').trim().slice(0, 100) || null,
      updated_at: new Date().toISOString()
    };
    const rows = await update('users', `id=eq.${encodeURIComponent(session.id)}&role=eq.doctor`, patch);
    const user = rows?.[0];
    if (!user) return res.status(404).json({ error: 'Doctor profile not found.' });
    try {
      await insert('analytics_events', { user_id: session.id, event_name: 'profile_update', route: '/doctor-dashboard.html', payload: { fields: Object.keys(patch).filter((field) => field !== 'updated_at') } });
      await insert('logs', { user_id: session.id, event: 'profile_update', module: 'profile', device: String(req.headers['user-agent'] || 'Unknown').slice(0, 180) });
    } catch {}
    const safe = { ...user };
    delete safe.password_hash;
    safe.completedModules = safe.completed_modules || [];
    safe.sessionDuration = safe.session_duration || '—';
    safe.lastLogin = safe.last_login || '—';
    delete safe.completed_modules; delete safe.session_duration; delete safe.last_login;
    return res.status(200).json({ user: safe, message: 'Profile updated.' });
  } catch {
    return res.status(500).json({ error: 'Could not save profile changes.' });
  }
}
