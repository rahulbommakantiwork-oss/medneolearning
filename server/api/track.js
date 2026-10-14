import { requireSession } from '../server/lib/session.js';
import { insert } from '../server/lib/db.js';

function classifyAgent(agent) {
  return {
    device_type: /tablet|ipad/i.test(agent) ? 'Tablet' : /mobile|android|iphone/i.test(agent) ? 'Mobile' : 'Desktop',
    browser: /Edg\//.test(agent) ? 'Edge' : /Chrome\//.test(agent) ? 'Chrome' : /Firefox\//.test(agent) ? 'Firefox' : /Safari\//.test(agent) ? 'Safari' : 'Other',
    os: /Windows/i.test(agent) ? 'Windows' : /Mac OS|Macintosh/i.test(agent) ? 'macOS' : /Android/i.test(agent) ? 'Android' : /iPhone|iPad|iOS/i.test(agent) ? 'iOS' : /Linux/i.test(agent) ? 'Linux' : 'Other'
  };
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const session = requireSession(req, res);
  if (!session) return;
  const body = req.body || {};
  const eventName = String(body.eventName || body.event_name || '').trim().toLowerCase().slice(0, 60);
  // Accept new instrumented UI/read/quiz events without rejecting the client; keep names constrained.
  if (!/^[a-z][a-z0-9_-]{1,59}$/.test(eventName)) return res.status(400).json({ error: 'Invalid analytics event name' });
  const agent = String(req.headers['user-agent'] || 'Unknown').slice(0, 180);
  const device = classifyAgent(agent);
  const duration = Math.max(0, Math.min(3600, Math.floor(Number(body.durationSeconds) || 0)));
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
  let payloadJson;
  try {
    payloadJson = JSON.stringify(payload);
    if (payloadJson.length > 5000) payloadJson = JSON.stringify({ truncated: true, summary: payloadJson.slice(0, 4500) });
  } catch { payloadJson = '{}'; }
  try {
    const rows = await insert('analytics_events', {
      user_id: session.id,
      session_id: String(body.sessionId || '').slice(0, 100) || null,
      event_name: eventName,
      route: String(body.route || '').slice(0, 200) || null,
      content_type: String(body.contentType || '').slice(0, 60) || null,
      content_id: String(body.contentId || '').slice(0, 160) || null,
      module_id: String(body.moduleId || '').slice(0, 160) || null,
      duration_seconds: duration,
      device_type: device.device_type,
      browser: device.browser,
      os: device.os,
      payload: JSON.parse(payloadJson)
    });
    if (['module_open', 'content_click', 'article_open', 'article_complete', 'quiz_complete', 'ad_click', 'external_link_click', 'download_click', 'profile_update'].includes(eventName)) {
      try {
        await insert('logs', {
          user_id: session.id,
          event: eventName,
          module: String(body.contentId || body.moduleId || body.payload?.label || '—').slice(0, 160),
          device: agent
        });
      } catch { /* Event row is the analytics source of truth. */ }
    }
    return res.status(201).json({ ok: true, id: rows?.[0]?.id || null });
  } catch (error) {
    console.error('Analytics event insert failed:', error?.status || '', error?.message || 'Unknown error');
    return res.status(500).json({ error: 'Analytics event could not be saved. Confirm analytics_events has the latest columns.' });
  }
}
