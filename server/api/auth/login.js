import crypto from 'node:crypto';
import { select, update, insert } from '../_lib/db.js';
import { verifyPassword } from '../_lib/password.js';
import { createSession, setSessionCookie } from '../_lib/session.js';

function digest(value) {
  const secret = process.env.GML_SESSION_SECRET;
  if (!secret) throw new Error('Session configuration is missing');
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim().slice(0, 100);
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  try {
    const { email, password } = req.body || {};
    const requestedRole = ['admin', 'doctor'].includes(String(req.body?.role || '')) ? String(req.body.role) : 'admin';
    if (!email || !password) return res.status(400).json({error:'Email and password are required'});
    const normalizedEmail = String(email).trim().toLowerCase().slice(0, 254);
    const identifierHash = digest(`login:${requestedRole}:${normalizedEmail}`);
    const ipHash = digest(`client-ip:${clientIp(req)}`);
    const since = encodeURIComponent(new Date(Date.now() - 15 * 60 * 1000).toISOString());
    const [identifierAttempts, ipAttempts] = await Promise.all([
      select('auth_attempts', `select=id,created_at&identifier_hash=eq.${identifierHash}&created_at=gte.${since}&order=created_at.desc&limit=6`),
      select('auth_attempts', `select=id,created_at&ip_hash=eq.${ipHash}&created_at=gte.${since}&order=created_at.desc&limit=21`)
    ]);
    if ((identifierAttempts || []).length >= 5 || (ipAttempts || []).length >= 20) {
      return res.status(429).json({error:'Too many sign-in attempts. Wait 15 minutes before trying again.'});
    }
    const users=await select('users',`select=id,name,email,role,status,password_hash,last_login,session_duration,modules,completed_modules,onboarded,score,streak,phone,state,city,specialization,experience,degree,hospital,registration_number,created_at&email=eq.${encodeURIComponent(normalizedEmail)}&limit=1`);
    const user=users?.[0];
    if (!user || user.role !== requestedRole || user.status !== 'active' || !(await verifyPassword(password, user.password_hash))) {
      try { await insert('auth_attempts', { identifier_hash: identifierHash, ip_hash: ipHash }); } catch {}
      return res.status(401).json({error:'Invalid email or password. Please try again.'});
    }
    const lastLogin = new Date().toISOString();
    await update('users',`id=eq.${encodeURIComponent(user.id)}`,{last_login:lastLogin, updated_at:lastLogin});
    try {
      const agent = String(req.headers['user-agent'] || 'Unknown').slice(0, 180);
      await insert('logs',{user_id:user.id,event: requestedRole === 'admin' ? 'Admin password login' : 'Doctor password login',module:'—',device:agent});
      await insert('analytics_events',{user_id:user.id,session_id:null,event_name:'login',route: requestedRole === 'admin' ? '/admin-dashboard.html' : '/doctor-dashboard.html',device_type:/tablet|ipad/i.test(agent)?'Tablet':/mobile|android|iphone/i.test(agent)?'Mobile':'Desktop',browser:/Edg\//.test(agent)?'Edge':/Chrome\//.test(agent)?'Chrome':/Firefox\//.test(agent)?'Firefox':/Safari\//.test(agent)?'Safari':'Other',os:/Windows/i.test(agent)?'Windows':/Mac OS|Macintosh/i.test(agent)?'macOS':/Android/i.test(agent)?'Android':/iPhone|iPad|iOS/i.test(agent)?'iOS':/Linux/i.test(agent)?'Linux':'Other',payload:{method:'password',role: requestedRole}});
    } catch {}
    const safe={...user};
    delete safe.password_hash;
    safe.modules=safe.modules||[];
    safe.completedModules=safe.completed_modules||[];
    safe.sessionDuration=safe.session_duration||'—';
    safe.lastLogin=safe.last_login||'—';
    safe.specialization=safe.specialization||'';
    delete safe.completed_modules; delete safe.session_duration; delete safe.last_login;
    const token=createSession(safe);
    setSessionCookie(res,token);
    return res.status(200).json({user:safe});
  } catch(e) {
    return res.status(500).json({error:'Login failed. Please try again.'});
  }
}
