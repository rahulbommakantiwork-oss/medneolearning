import { supabaseFetch, insert, update } from './db.js';

export function normalizeWhatsAppNumber(value) {
  const digits=String(value||'').replace(/[^\d]/g,'');
  if (digits.length<10 || digits.length>15) throw new Error('Invalid WhatsApp number');
  return digits;
}
export async function sendWhatsAppTemplate({to,name,email,specialization,portalUrl}) {
  const token=process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId=process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version=process.env.WHATSAPP_GRAPH_VERSION;
  const template=process.env.WHATSAPP_TEMPLATE_NAME;
  const language=process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en';
  if (!token || !phoneId || !version || !template) throw new Error('WhatsApp is not configured. Add the Meta WhatsApp Cloud API environment variables in Vercel.');
  const body={
    messaging_product:'whatsapp',
    to:normalizeWhatsAppNumber(to),
    type:'template',
    template:{
      name:template,
      language:{code:language},
      components:[{
        type:'body',
        parameters:[
          {type:'text',text:String(name)},
          {type:'text',text:String(email)},
          {type:'text',text:String(specialization||'Medical Professional')},
          {type:'text',text:String(portalUrl)}
        ]
      }]
    }
  };
  const r=await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`,{
    method:'POST',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  const payload=await r.json().catch(()=>({}));
  if(!r.ok) {
    const msg=payload?.error?.message || `WhatsApp request failed (${r.status})`;
    const e=new Error(msg); e.payload=payload; e.status=r.status; throw e;
  }
  return {messageId:payload?.messages?.[0]?.id || null,payload};
}
