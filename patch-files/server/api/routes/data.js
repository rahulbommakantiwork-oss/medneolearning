import { requireSession } from '../_lib/session.js';
import { select } from '../_lib/db.js';

export default async function handler(req,res) {
  const session=requireSession(req,res);
  if (!session) return;
  try {
    const contentRows=await select('app_content','key=eq.main&select=payload&limit=1');
    const payload=contentRows?.[0]?.payload || {modules:[],slideDecks:{},articles:{},quizzes:{},stateCities:{}};
    let users=[];
    let logs=[];
    if (session.role==='admin') {
      const raw=await select('users','select=id,name,email,role,status,phone,state,city,specialization,experience,last_login,session_duration,modules,completed_modules,onboarded,score,streak&order=created_at.desc');
      users=(raw||[]).map(u=>({...u,modules:u.modules||[],completedModules:u.completed_modules||[],sessionDuration:u.session_duration||'—',lastLogin:u.last_login||'—'}));
      logs=await select('logs','select=id,user_id,event,module,device,created_at&order=created_at.desc&limit=200');
    } else {
      const me=await select('users',`select=id,name,email,role,status,phone,state,city,specialization,experience,last_login,session_duration,modules,completed_modules,onboarded,score,streak&id=eq.${encodeURIComponent(session.id)}&limit=1`);
      users=(me||[]).map(u=>({...u,modules:u.modules||[],completedModules:u.completed_modules||[],sessionDuration:u.session_duration||'—',lastLogin:u.last_login||'—'}));
    }
    const normalizedLogs=(logs||[]).map(l=>({time:l.created_at,user:l.user_id,event:l.event,module:l.module||'—',device:l.device||'—'}));
    return res.status(200).json({...payload,users,logs:normalizedLogs});
  } catch(e) { return res.status(500).json({error:e.message||'Unable to load server data'}); }
}
