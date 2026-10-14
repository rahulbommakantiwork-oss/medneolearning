import crypto from 'node:crypto';
import { requireSession } from '../_lib/session.js';
import { select, selectAll, insert } from '../_lib/db.js';
import { hashPassword } from '../_lib/password.js';
import { normalizePhone } from '../_lib/phone.js';

function publicDoctor(user) {
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
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  const session = requireSession(req, res, 'admin');
  if (!session) return;
  if (req.method === 'GET') {
    try {
      const rows = await selectAll('users', 'select=id,name,email,role,status,phone,state,city,specialization,experience,degree,hospital,registration_number,last_login,session_duration,modules,completed_modules,onboarded,score,streak,welcome_email_opt_in,welcome_email_status,password_set_at,phone_verified,created_at,updated_at&role=eq.doctor&order=created_at.desc', { maxRows: 20000 });
      return res.status(200).json({ users: rows.map(publicDoctor) });
    } catch {
      return res.status(500).json({ error: 'Unable to load doctors.' });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim().slice(0, 160);
    const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
    const phone = normalizePhone(body.phone);
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !phone) {
      return res.status(400).json({ error: 'Enter a full name, valid email and valid mobile number.' });
    }
    const doctors = await selectAll('users', 'select=id,email,phone,role&role=eq.doctor', { maxRows: 20000 });
    if (doctors.some((user) => user.email?.toLowerCase() === email || normalizePhone(user.phone) === phone)) {
      return res.status(409).json({ error: 'A doctor with this email or phone number already exists.' });
    }
    const id = `u_${crypto.randomBytes(12).toString('hex')}`;
    // Create a random unusable password hash until the doctor opens the one-time setup link.
    const passwordHash = await hashPassword(crypto.randomBytes(32).toString('base64url'));
    const row = {
      id, name, email, phone,
      state: String(body.state || '').trim().slice(0, 100) || null,
      city: String(body.city || '').trim().slice(0, 100) || null,
      specialization: String(body.specialization || '').trim().slice(0, 160) || null,
      experience: String(body.experience || '').trim().slice(0, 80) || null,
      degree: String(body.degree || '').trim().slice(0, 120) || null,
      hospital: String(body.hospital || '').trim().slice(0, 180) || null,
      registration_number: String(body.registrationNumber || '').trim().slice(0, 100) || null,
      role: 'doctor', status: 'active', password_hash: passwordHash, password_set_at: null, phone_verified: false, welcome_email_opt_in: false, welcome_email_status: 'not_requested',
      modules: [], completed_modules: [], onboarded: true, score: 0, streak: 0,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    const created = (await insert('users', row))?.[0];
    if (!created) throw new Error('No user returned');
    try { await insert('logs', { user_id: session.id, event: 'Doctor Created', module: created.id, device: String(req.headers['user-agent'] || 'Unknown').slice(0, 180) }); } catch {}
    return res.status(201).json({ user: publicDoctor(created), message: 'Doctor profile created. Send the invitation so they can choose their own password.' });
  } catch (error) {
    if (error.status === 409) return res.status(409).json({ error: 'A doctor with this email or phone number already exists.' });
    return res.status(500).json({ error: 'Unable to create doctor. Check the database migration and try again.' });
  }
}
