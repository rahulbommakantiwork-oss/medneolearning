import { requireSession } from '../../_lib/session.js';
import { select, supabaseFetch } from '../../_lib/db.js';

export default async function handler(req,res) {
  const s=requireSession(req,res);
  if(!s) return;
  const id=req.query?.id;
  if(!id) return res.status(400).send('Missing module id');
  try {
    const rows=await select('module_files',`select=id,storage_path,owner_user_id,active&public_id=eq.${encodeURIComponent(id)}&active=eq.true&limit=1`);
    const file=rows?.[0];
    if(!file) return res.status(404).send('Module not found');
    if(s.role!=='admin' && file.owner_user_id!==s.id) return res.status(403).send('Forbidden');
    const signed=await supabaseFetch(`/storage/v1/object/sign/modules/${encodeURIComponent(file.storage_path)}?expiresIn=300`,{
      method:'POST',
      headers:{Prefer:'return=representation'}
    });
    const signedPath=signed?.signedURL || signed?.signedUrl || signed?.path;
    if(!signedPath) return res.status(500).send('Unable to create download link');
    let url=signedPath.startsWith('http')?signedPath:`${process.env.SUPABASE_URL}/storage/v1/${String(signedPath).replace(/^\/+/,'')}`;
    res.setHeader('Cache-Control','no-store');
    return res.redirect(302,url);
  } catch(e) { return res.status(500).send(e.message||'Unable to open module'); }
}
