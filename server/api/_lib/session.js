import crypto from 'node:crypto';

const COOKIE = 'gml_session';

function secret() {
  if (!process.env.GML_SESSION_SECRET) throw new Error('Missing environment variable: GML_SESSION_SECRET');
  return process.env.GML_SESSION_SECRET;
}
function b64url(value) {
  return Buffer.from(value).toString('base64url');
}
function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}
export function createSession(user) {
  const safe = { id:user.id, role:user.role, name:user.name, email:user.email, exp: Date.now()+8*60*60*1000 };
  const payload=b64url(JSON.stringify(safe));
  return `${payload}.${sign(payload)}`;
}
export function readSession(req) {
  const raw = req.headers.cookie || '';
  const match = raw.match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`));
  if (!match) return null;
  const token=match[1];
  const [payload,sig]=token.split('.');
  if (!payload || !sig) return null;
  const expected=sign(payload);
  const a=Buffer.from(sig), b=Buffer.from(expected);
  if (a.length!==b.length || !crypto.timingSafeEqual(a,b)) return null;
  let data;
  try { data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8')); } catch { return null; }
  if (!data.exp || Date.now()>data.exp) return null;
  return data;
}
export function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`);
}
export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}
export function requireSession(req,res,role) {
  const session=readSession(req);
  if (!session) { res.status(401).json({error:'Authentication required'}); return null; }
  if (role && session.role!==role) { res.status(403).json({error:'Forbidden'}); return null; }
  return session;
}
