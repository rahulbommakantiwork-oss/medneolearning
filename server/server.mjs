import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon', '.woff':'font/woff', '.woff2':'font/woff2', '.pdf':'application/pdf' };

// Tiny .env reader for local development; process environment always wins.
function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv();

function securityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
}
function json(res, status, body) {
  if (res.writableEnded) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw Object.assign(new Error('Request body too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (!size) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  if ((req.headers['content-type'] || '').includes('application/json')) {
    try { return JSON.parse(raw); } catch { throw Object.assign(new Error('Invalid JSON body'), { status: 400 }); }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}
function makeResponse(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => json(res, res.statusCode || 200, body);
  return res;
}
function findApiHandler(pathname) {
  const clean = pathname.replace(/^\/+|\/+$/g, '');
  if (!clean.startsWith('api/')) return null;
  const relative = clean.slice(4).split('/').filter(Boolean);
  if (!relative.length || relative.some(part => part === '.' || part === '..')) return null;
  let direct = path.join(ROOT, 'api', ...relative) + '.js';
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return { file: direct, params: {} };
  // Match Vercel's api/module/[id].js dynamic route convention.
  for (let count = relative.length - 1; count >= 1; count--) {
    const prefix = relative.slice(0, count);
    const candidate = path.join(ROOT, 'api', ...prefix, '[id].js');
    if (fs.existsSync(candidate)) return { file: candidate, params: { id: decodeURIComponent(relative.slice(count).join('/')) } };
  }
  return null;
}
async function handleApi(req, res, url) {
  const found = findApiHandler(url.pathname);
  if (!found) return json(res, 404, { error: 'API route not found. Check the URL and restart the local server.' });
  let body;
  try { body = await readBody(req); }
  catch (error) { return json(res, error.status || 400, { error: error.message || 'Invalid request body.' }); }
  const query = { ...found.params, ...Object.fromEntries(url.searchParams.entries()) };
  const request = Object.assign(req, { body, query, url: req.url, originalUrl: req.url });
  const response = makeResponse(res);
  try {
    const module = await import(`${pathToFileURL(found.file).href}?local=${crypto.randomBytes(6).toString('hex')}`);
    await module.default(request, response);
    if (!res.writableEnded) json(res, res.statusCode || 204, {});
  } catch (error) {
    console.error(`[API ${req.method} ${url.pathname}]`, error?.message || error);
    if (!res.writableEnded) json(res, 500, { error: 'The server could not complete this request. Check server logs and environment configuration.' });
  }
}
function safeStaticPath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const resolved = path.resolve(ROOT, relative);
  if (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) return null;
  // Never expose API source, server helpers, secrets, or project configuration as static files.
  if (['api', 'server', 'scripts', 'node_modules'].some(dir => resolved === path.join(ROOT, dir) || resolved.startsWith(path.join(ROOT, dir) + path.sep))) return null;
  if (/^(?:\.env|package(?:-lock)?\.json|vercel\.json|server\.mjs)$/i.test(path.basename(resolved))) return null;
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
  return resolved;
}
const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
  const file = safeStaticPath(url.pathname);
  if (!file) return json(res, 404, { error: 'File not found' });
  res.statusCode = 200;
  res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`MedNeo local server: http://localhost:${PORT}`);
  console.log(`API health check:   http://localhost:${PORT}/api/health`);
  if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) || !process.env.GML_SESSION_SECRET) {
    console.warn('Set SUPABASE_URL, SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY), and GML_SESSION_SECRET in .env before using account/database features.');
  }
});
