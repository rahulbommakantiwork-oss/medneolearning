import { readSession } from '../_lib/session.js';
import { select } from '../_lib/db.js';
export default async function handler(req,res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  if (req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const s=readSession(req);
  if (!s) return res.status(401).json({error:'Not signed in'});
  try {
    const users=await select('users',`select=id,name,email,role,status,phone,state,city,specialization,experience,degree,hospital,registration_number,last_login,session_duration,modules,completed_modules,onboarded,score,streak,welcome_email_opt_in,password_set_at,created_at& id=eq.${encodeURIComponent(s.id)}&limit=1`.replace('& id','&id'));
    const u=users?.[0];
    if (!u || u.status!=='active') return res.status(401).json({error:'Account inactive'});
    const safe={...u,modules:u.modules||[],completedModules:u.completed_modules||[],sessionDuration:u.session_duration||'—',lastLogin:u.last_login||'—'};
    delete safe.completed_modules; delete safe.session_duration; delete safe.last_login;
    return res.status(200).json({user:safe});
  } catch { return res.status(500).json({error:'Session lookup failed'}); }
}
