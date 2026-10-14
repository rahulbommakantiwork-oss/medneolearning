import { requireSession } from '../../server/lib/session.js';
import { select, selectAll } from '../../server/lib/db.js';

function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return respond(res, 405, { error: 'Method not allowed' });
  const session = requireSession(req, res, 'admin');
  if (!session) return;
  const offset = Math.max(0, Math.min(10000000, Math.floor(Number(req.query?.offset) || 0)));
  const limit = Math.max(1, Math.min(100, Math.floor(Number(req.query?.limit) || 100)));
  try {
    const [attempts, users] = await Promise.all([
      select('quiz_attempts', `select=id,user_id,quiz_id,quiz_title,total_questions,answers,score,percentage,passed,duration_seconds,created_at&order=created_at.desc&limit=${limit}&offset=${offset}`),
      selectAll('users', 'select=id,name,email&role=eq.doctor', { maxRows: 20000 })
    ]);
    const byId = new Map((users || []).map((user) => [String(user.id), user]));
    const rows = (attempts || []).map((attempt) => ({
      ...attempt,
      doctorName: byId.get(String(attempt.user_id))?.name || 'Unknown doctor',
      doctorEmail: byId.get(String(attempt.user_id))?.email || ''
    }));
    return respond(res, 200, { attempts: rows, hasMore: rows.length === limit, nextOffset: offset + rows.length });
  } catch (error) {
    console.error('Admin quiz attempts load failed:', error?.status || '', error?.message || 'Unknown error');
    return respond(res, 500, { error: 'Unable to load older assessment attempts. Confirm the quiz_attempts migration is applied.' });
  }
}
