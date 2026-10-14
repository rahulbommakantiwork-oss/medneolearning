import { requireSession } from '../../_lib/session.js';
import { select, update, insert } from '../../_lib/db.js';
import { sendWhatsAppTemplate, normalizeWhatsAppNumber } from '../../_lib/whatsapp.js';

export default async function handler(req,res) {
  const s=requireSession(req,res,'admin'); if(!s) return;
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  try {
    const {doctorId,name,email,phone,specialization}=req.body||{};
    let doctor=null;
    if(doctorId) {
      const rows=await select('users',`select=id,name,email,phone,specialization,role&id=eq.${encodeURIComponent(doctorId)}&role=eq.doctor&limit=1`);
      doctor=rows?.[0]||null;
    } else {
      doctor={name,email,phone,specialization};
    }
    if(!doctor?.name || !doctor?.email || !doctor?.phone) return res.status(400).json({error:'Doctor name, email and WhatsApp number are required'});
    const to=normalizeWhatsAppNumber(doctor.phone);
    const portalUrl=(process.env.APP_ORIGIN || '').replace(/\/$/,'') || `https://${req.headers.host}`;
    let wa;
    try {
      wa=await sendWhatsAppTemplate({to,name:doctor.name,email:doctor.email,specialization:doctor.specialization,portalUrl});
      if(doctor.id) await update('users',`id=eq.${encodeURIComponent(doctor.id)}`,{last_whatsapp_status:'sent',last_whatsapp_message_id:wa.messageId,last_whatsapp_sent_at:new Date().toISOString()});
    } catch(e) {
      if(doctor.id) await update('users',`id=eq.${encodeURIComponent(doctor.id)}`,{last_whatsapp_status:'failed',last_whatsapp_error:String(e.message).slice(0,500)});
      try { await insert('whatsapp_messages',{user_id:doctor.id||null,to_number:to,status:'failed',error:String(e.message).slice(0,500)}); } catch {}
      return res.status(502).json({error:e.message||'WhatsApp send failed',saved:true});
    }
    try { await insert('whatsapp_messages',{user_id:doctor.id||null,to_number:to,status:'sent',message_id:wa.messageId,provider_payload:wa.payload}); } catch {}
    try { await insert('logs',{user_id:s.id,event:'WhatsApp Sent',module:doctor.name,device:req.headers['user-agent']?.slice(0,180)||'Unknown'}); } catch {}
    return res.status(200).json({ok:true,messageId:wa.messageId});
  } catch(e) { return res.status(500).json({error:e.message||'Unable to send WhatsApp message'}); }
}
