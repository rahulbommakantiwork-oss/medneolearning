import { select, update } from '../_lib/db.js';

export default async function handler(req,res) {
  if(req.method==='GET') {
    const mode=req.query?.['hub.mode'];
    const token=req.query?.['hub.verify_token'];
    const challenge=req.query?.['hub.challenge'];
    if(mode==='subscribe' && token && token===process.env.WHATSAPP_VERIFY_TOKEN) return res.status(200).send(challenge);
    return res.status(403).send('Verification failed');
  }
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  try {
    const entries=req.body?.entry||[];
    for(const entry of entries) for(const change of (entry.changes||[])) {
      const statuses=change.value?.statuses||[];
      for(const st of statuses) {
        const msgId=st.id, status=st.status;
        if(!msgId) continue;
        const rows=await select('whatsapp_messages',`select=id,user_id&message_id=eq.${encodeURIComponent(msgId)}&limit=1`);
        if(rows?.[0]) await update('whatsapp_messages',`id=eq.${encodeURIComponent(rows[0].id)}`,{status,recipient_status_at:new Date().toISOString(),provider_status:st});
      }
    }
    return res.status(200).json({ok:true});
  } catch(e) { return res.status(500).json({error:e.message||'Webhook error'}); }
}
