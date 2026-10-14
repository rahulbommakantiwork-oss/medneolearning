/* Signed HttpOnly cookie session shared by local and Vercel API handlers. */
import crypto from 'node:crypto';

const COOKIE_NAME = 'gml_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function getSecret() {
  const value = String(process.env.GML_SESSION_SECRET || '');
  if (value.length < 32) {
    throw new Error('GML_SESSION_SECRET must be configured with at least 32 characters.');
  }
  return value;
}

function encode(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function sign(payload) {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createSession(user) {
  if (!user?.id || !user?.role) throw new Error('A user ID and role are required to create a session.');
  const payload = encode(JSON.stringify({
    id: user.id,
    role: user.role,
    name: user.name || '',
    email: user.email || '',
    exp: Date.now() + SESSION_TTL_MS
  }));
  return `${payload}.${sign(payload)}`;
}

export function readSession(req) {
  const rawCookie = String(req?.headers?.cookie || '');
  const parts = rawCookie.split(';');
  let token = '';
  for (const part of parts) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === COOKIE_NAME) {
      token = part.slice(index + 1).trim();
      break;
    }
  }
  if (!token) return null;

  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!session?.id || !session?.role || !Number.isFinite(session.exp) || Date.now() >= session.exp) return null;
    return session;
  } catch {
    return null;
  }
}

export function setSessionCookie(res, token) {
  const secure = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`);
}

export function clearSessionCookie(res) {
  const secure = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

export function requireSession(req, res, role) {
  let session;
  try {
    session = readSession(req);
  } catch (error) {
    const message = process.env.NODE_ENV === 'production'
      ? 'Server session configuration is incomplete.'
      : error.message;
    return res.status(500).json({ error: message });
  }
  if (!session) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  if (role && session.role !== role) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return session;
}
