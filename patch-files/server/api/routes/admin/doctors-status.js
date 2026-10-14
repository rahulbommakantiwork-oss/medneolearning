import { requireSession } from '../../_lib/session.js';
import { update, insert } from '../../_lib/db.js';
export default async function handler(req,res) {
  const s=requireSession(req,res,'admin'); if(!s) return;
  if(req.method!=='PATCH') return res.status(405).json({error:'Method not allowed'});
  try {
    const {id,status}=req.body||{};
    if(!id || !['active','inactive'].includes(status)) return res.status(400).json({error:'Invalid status'});
    const rows=await update('users',`id=eq.${encodeURIComponent(id)}&role=eq.doctor`,{status});
    if(!rows?.length) return res.status(404).json({error:'Doctor not found'});
    try { await insert('logs',{user_id:s.id,event:status==='active'?'Doctor Activated':'Doctor Deactivated',module:'—',device:req.headers['user-agent']?.slice(0,180)||'Unknown'}); } catch {}
    return res.status(200).json({user:rows[0]});
  } catch(e) { return res.status(500).json({error:e.message||'Unable to update doctor'}); }
}
