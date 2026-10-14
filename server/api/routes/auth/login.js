import { select, update, insert } from '../../_lib/db.js';
import { verifyPassword } from '../../_lib/password.js';
import { createSession, setSessionCookie } from '../../_lib/session.js';

export default async function handler(req,res) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  try {
    const {email,password}=req.body||{};
    if (!email || !password) return res.status(400).json({error:'Email and password are required'});
    const users=await select('users',`select=id,name,email,role,status,password_hash,last_login,session_duration,modules,completed_modules,onboarded,score,streak,phone,state,city,specialization,experience&email=eq.${encodeURIComponent(email.toLowerCase())}&limit=1`);
    const user=users?.[0];
    if (!user || user.status!=='active' || !(await verifyPassword(password,user.password_hash))) {
      return res.status(401).json({error:'Invalid email or password. Please try again.'});
    }
    await update('users',`id=eq.${encodeURIComponent(user.id)}`,{last_login:new Date().toISOString()});
    try { await insert('logs',{user_id:user.id,event:'Login',module:'—',device:req.headers['user-agent']?.slice(0,180)||'Unknown'}); } catch {}
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
    return res.status(500).json({error:e.message||'Login failed'});
  }
}
