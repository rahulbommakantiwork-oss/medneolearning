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
    const [events, doctors] = await Promise.all([
      select('analytics_events', `select=id,user_id,session_id,content_id,module_id,payload,device_type,browser,os,created_at&event_name=eq.quiz_answer&order=created_at.desc&limit=${limit}&offset=${offset}`),
      selectAll('users', 'select=id,name,email&role=eq.doctor', { maxRows: 20000 })
    ]);
    const byId = new Map((doctors || []).map((doctor) => [String(doctor.id), doctor]));
    const answers = (events || []).map((event) => {
      const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
      const doctor = byId.get(String(event.user_id)) || {};
      return {
        id: event.id,
        user_id: event.user_id,
        doctorName: doctor.name || 'Unknown doctor',
        doctorEmail: doctor.email || '',
        sessionId: event.session_id || null,
        moduleId: event.module_id || '',
        quizId: event.content_id || '',
        questionIndex: Number(payload.questionIndex) || 0,
        correctIndex: Number.isInteger(Number(payload.correctIndex)) ? Number(payload.correctIndex) : -1,
        questionId: String(payload.questionId || ''),
        question: String(payload.question || ''),
        options: Array.isArray(payload.options) ? payload.options.map((option) => String(option ?? '')) : [],
        selectedAnswer: String(payload.selectedAnswer || ''),
        correctAnswer: String(payload.correctAnswer || ''),
        isCorrect: payload.isCorrect === true,
        device: String(event.device_type || ''),
        browser: String(event.browser || ''),
        os: String(event.os || ''),
        created_at: event.created_at
      };
    });
    return respond(res, 200, { answers, hasMore: answers.length === limit, nextOffset: offset + answers.length });
  } catch (error) {
    console.error('Admin question-answer events failed:', error?.status || '', error?.message || 'Unknown error');
    return respond(res, 500, { error: 'Unable to load question-answer events. Confirm the analytics migration is applied.' });
  }
}
