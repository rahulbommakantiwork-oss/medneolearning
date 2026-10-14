import health from '../server/api/routes/health.js';
import data from '../server/api/routes/data.js';
import doctors from '../server/api/routes/admin/doctors.js';
import doctorsStatus from '../server/api/routes/admin/doctors-status.js';
import invite from '../server/api/routes/admin/invite.js';
import login from '../server/api/routes/auth/login.js';
import logout from '../server/api/routes/auth/logout.js';
import me from '../server/api/routes/auth/me.js';
import moduleFile from '../server/api/routes/module/[id].js';
import whatsappWebhook from '../server/api/routes/whatsapp/webhook.js';

const routes = new Map([
  ['/api/health', health],
  ['/api/data', data],
  ['/api/admin/doctors', doctors],
  ['/api/admin/doctors-status', doctorsStatus],
  ['/api/admin/invite', invite],
  ['/api/auth/login', login],
  ['/api/auth/logout', logout],
  ['/api/auth/me', me],
  ['/api/module', moduleFile],
  ['/api/whatsapp/webhook', whatsappWebhook],
]);

function pathnameFromRequest(req) {
  try {
    const pathname = new URL(req.url || '/', 'https://medneo.invalid').pathname;
    return pathname.replace(/\/+$/, '') || '/';
  } catch {
    return String(req.url || '/').split('?')[0].replace(/\/+$/, '') || '/';
  }
}

export default async function handler(req, res) {
  const pathname = pathnameFromRequest(req);
  let target = routes.get(pathname);

  // Preserve the original /api/module/:id behavior expected by the existing handler.
  if (!target && pathname.startsWith('/api/module/')) {
    const encodedId = pathname.slice('/api/module/'.length);
    if (encodedId && !encodedId.includes('/')) {
      let id = encodedId;
      try { id = decodeURIComponent(encodedId); } catch {}
      req.query = { ...(req.query || {}), id };
      target = moduleFile;
    }
  }

  if (!target) return res.status(404).json({ error: 'Not found' });
  return target(req, res);
}
