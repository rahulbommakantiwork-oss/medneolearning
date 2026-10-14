import crypto from 'node:crypto';
import { requireSession } from '../../_lib/session.js';
import { select, insert } from '../../_lib/db.js';
import { hashPassword } from '../../_lib/password.js';

function cleanPhone(v) {
  const digits=String(v||'').replace(/[^\d]/g,'');
  if (digits.length<10 || digits.length>15) return null;
  return `+${digits}`;
}
export default async function handler(req,res) {
  const s=requireSession(req,res,'admin'); if (!s) return;
  if (req.method==='GET') {
    try {
      const rows=await select('users','select=id,name,email,role,status,phone,state,city,specialization,experience,last_login,session_duration,modules,completed_modules,onboarded,score,streak&role=eq.doctor&order=created_at.desc');
      return res.status(200).json({users:(rows||[]).map(u=>({...u,modules:u.modules||[],completedModules:u.completed_modules||[],sessionDuration:u.session_duration||'—',lastLogin:u.last_login||'—'}))});
    } catch(e) { return res.status(500).json({error:e.message||'Unable to load doctors'}); }
  }
  if (req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  try {
    const {name,email,phone,specialization,state='',city='',experience=''}=req.body||{};
    const normalizedEmail=String(email||'').trim().toLowerCase();
    const normalizedPhone=cleanPhone(phone);
    if (!name || !normalizedEmail || !normalizedPhone) return res.status(400).json({error:'Name, email and a valid WhatsApp number are required'});
    const existing=await select('users',`select=id&or=(email.eq.${encodeURIComponent(normalizedEmail)},phone.eq.${encodeURIComponent(normalizedPhone)})&limit=1`);
    if (existing?.length) return res.status(409).json({error:'A doctor with this email or WhatsApp number already exists.'});
    const tempPassword=crypto.randomBytes(18).toString('base64url');
    const password_hash=await hashPassword(tempPassword);
    const id='u_'+crypto.randomBytes(10).toString('hex');
    const rows=await insert('users',{id,name:String(name).trim(),email:normalizedEmail,phone:normalizedPhone,specialization:String(specialization||'').trim(),state:String(state||'').trim(),city:String(city||'').trim(),experience:String(experience||'').trim(),role:'doctor',status:'active',password_hash,modules:[],completed_modules:[],onboarded:true,score:0,streak:0});
    const created=rows?.[0]||{};
    delete created.password_hash;
    return res.status(201).json({user:created,message:'Doctor saved'});
  } catch(e) { return res.status(500).json({error:e.message||'Unable to create doctor'}); }
}
