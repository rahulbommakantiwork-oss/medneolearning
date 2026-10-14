import route0 from "../server/api/auth/otp/start.js";
import route1 from "../server/api/auth/otp/verify.js";
import route2 from "../server/api/admin/backup.js";
import route3 from "../server/api/admin/doctors.js";
import route4 from "../server/api/admin/doctors-status.js";
import route5 from "../server/api/admin/export.js";
import route6 from "../server/api/admin/invite.js";
import route7 from "../server/api/admin/module-publish.js";
import route8 from "../server/api/admin/module-quiz.js";
import route9 from "../server/api/admin/module-upload-url.js";
import route10 from "../server/api/admin/question-answers.js";
import route11 from "../server/api/admin/quiz-attempts.js";
import route12 from "../server/api/auth/forgot-password.js";
import route13 from "../server/api/auth/login.js";
import route14 from "../server/api/auth/logout.js";
import route15 from "../server/api/auth/me.js";
import route16 from "../server/api/auth/password-setup.js";
import route17 from "../server/api/auth/register.js";
import route18 from "../server/api/auth/reset-password.js";
import route19 from "../server/api/cron/backup.js";
import route20 from "../server/api/doctor/profile.js";
import route21 from "../server/api/whatsapp/webhook.js";
import route22 from "../server/api/data.js";
import route23 from "../server/api/health.js";
import route24 from "../server/api/quiz-answer.js";
import route25 from "../server/api/quiz-attempt.js";
import route26 from "../server/api/track.js";
import route27 from "../server/api/module/[id].js";

const routeDefinitions = [
  { template: "auth/otp/start", handler: route0 },
  { template: "auth/otp/verify", handler: route1 },
  { template: "admin/backup", handler: route2 },
  { template: "admin/doctors", handler: route3 },
  { template: "admin/doctors-status", handler: route4 },
  { template: "admin/export", handler: route5 },
  { template: "admin/invite", handler: route6 },
  { template: "admin/module-publish", handler: route7 },
  { template: "admin/module-quiz", handler: route8 },
  { template: "admin/module-upload-url", handler: route9 },
  { template: "admin/question-answers", handler: route10 },
  { template: "admin/quiz-attempts", handler: route11 },
  { template: "auth/forgot-password", handler: route12 },
  { template: "auth/login", handler: route13 },
  { template: "auth/logout", handler: route14 },
  { template: "auth/me", handler: route15 },
  { template: "auth/password-setup", handler: route16 },
  { template: "auth/register", handler: route17 },
  { template: "auth/reset-password", handler: route18 },
  { template: "cron/backup", handler: route19 },
  { template: "doctor/profile", handler: route20 },
  { template: "whatsapp/webhook", handler: route21 },
  { template: "data", handler: route22 },
  { template: "health", handler: route23 },
  { template: "quiz-answer", handler: route24 },
  { template: "quiz-attempt", handler: route25 },
  { template: "track", handler: route26 },
  { template: "module/[id]", handler: route27 },
].map((route) => compileRoute(route));

function escapeRegex(value) {
  return value.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
}
function compileRoute(route) {
  const params = [];
  const segments = route.template ? route.template.split('/') : [];
  const pattern = segments.map((segment) => {
    const match = segment.match(/^\[([^\]]+)\]$/);
    if (match) {
      params.push(match[1]);
      return '([^/]+)';
    }
    return escapeRegex(segment);
  }).join('/');
  return { ...route, params, matcher: new RegExp('^' + pattern + '$') };
}
function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}
function requestedPath(req) {
  // The vercel.json rewrite passes the original endpoint in __route; URL parsing is a local fallback.
  const routed = firstValue(req.query?.__route);
  if (routed !== undefined && routed !== null && String(routed).trim() !== '') {
    return String(routed).replace(/^\/+|\/+$/g, '');
  }
  const parsed = new URL(req.url || '/', 'http://localhost');
  return parsed.pathname.replace(/^\/api(?=\/|$)/i, '').replace(/^\/+|\/+$/g, '');
}
export default async function handler(req, res) {
  const endpoint = requestedPath(req);
  for (const route of routeDefinitions) {
    const match = route.matcher.exec(endpoint);
    if (!match) continue;
    const query = { ...(req.query || {}) };
    delete query.__route;
    for (let i = 0; i < route.params.length; i++) {
      try { query[route.params[i]] = decodeURIComponent(match[i + 1]); }
      catch { query[route.params[i]] = match[i + 1]; }
    }
    req.query = query;
    return await route.handler(req, res);
  }
  return res.status(404).json({ error: 'API route not found' });
}
