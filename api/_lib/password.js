import crypto from 'node:crypto';
import { promisify } from 'node:util';
const scrypt=promisify(crypto.scrypt);

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8) throw new Error('Password must be at least 8 characters');
  const salt=crypto.randomBytes(16);
  const derived=await scrypt(password,salt,64,{N:16384,r:8,p:1});
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}
export async function verifyPassword(password, stored) {
  const [scheme,N,r,p,saltB64,hashB64]=String(stored||'').split('$');
  if (scheme!=='scrypt' || !saltB64 || !hashB64) return false;
  const salt=Buffer.from(saltB64,'base64url');
  const expected=Buffer.from(hashB64,'base64url');
  try {
    const actual=Buffer.from(await scrypt(password,salt,expected.length,{N:Number(N),r:Number(r),p:Number(p)}));
    return actual.length===expected.length && crypto.timingSafeEqual(actual,expected);
  } catch { return false; }
}
