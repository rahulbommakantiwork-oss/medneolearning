import { requireSession } from '../server/lib/session.js';
import { select, insert } from '../server/lib/db.js';

function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  return res.status(status).json(body);
}
function classify(agent) {
  return {
    device_type: /tablet|ipad/i.test(agent) ? 'Tablet' : /mobile|android|iphone/i.test(agent) ? 'Mobile' : 'Desktop',
    browser: /Edg\//.test(agent) ? 'Edge' : /Chrome\//.test(agent) ? 'Chrome' : /Firefox\//.test(agent) ? 'Firefox' : /Safari\//.test(agent) ? 'Safari' : 'Other',
    os: /Windows/i.test(agent) ? 'Windows' : /Mac OS|Macintosh/i.test(agent) ? 'macOS' : /Android/i.test(agent) ? 'Android' : /iPhone|iPad|iOS/i.test(agent) ? 'iOS' : /Linux/i.test(agent) ? 'Linux' : 'Other'
  };
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });
  const session = requireSession(req, res, 'doctor');
  if (!session) return;
  try {
    const quizId = String(req.body?.quizId || '').slice(0, 160);
    const questionIndex = Number(req.body?.questionIndex);
    const selectedIndex = Number(req.body?.selectedIndex);
    if (!quizId || !Number.isInteger(questionIndex) || questionIndex < 0 || !Number.isInteger(selectedIndex) || selectedIndex < 0) {
      return respond(res, 400, { error: 'Choose an answer for the current question.' });
    }
    const rows = await select('app_content', 'select=payload&key=eq.main&limit=1');
    const payload = rows?.[0]?.payload;
    const quiz = payload?.quizzes?.[quizId];
    if (!quiz || !Array.isArray(quiz.questions) || quiz.questions.length !== 5) {
      return respond(res, 409, { error: 'This assessment is not ready. The administrator must publish exactly 5 questions.' });
    }
    const question = quiz.questions[questionIndex];
    if (!question || !Array.isArray(question.options) || selectedIndex >= question.options.length || !Number.isInteger(Number(question.correct))) {
      return respond(res, 404, { error: 'This question is not available in the current assessment. Reload the module and try again.' });
    }
    const module = (payload.modules || []).find((item) => (item.contents || []).some((content) => content.id === quizId));
    if (!module || module.status !== 'active') return respond(res, 403, { error: 'This module is not currently published.' });
    const correctIndex = Number(question.correct);
    const isCorrect = selectedIndex === correctIndex;
    const answer = {
      questionIndex,
      questionId: String(question.id || `q${questionIndex + 1}`),
      question: String(question.question || ''),
      options: question.options,
      selectedIndex,
      selectedAnswer: String(question.options[selectedIndex] ?? ''),
      correctIndex,
      correctAnswer: String(question.options[correctIndex] ?? ''),
      isCorrect
    };
    const agent = String(req.headers['user-agent'] || 'Unknown').slice(0, 180);
    const rowsInserted = await insert('analytics_events', {
      user_id: session.id,
      session_id: String(req.body?.sessionId || '').slice(0, 100) || null,
      event_name: 'quiz_answer',
      route: '/doctor-dashboard.html',
      content_type: 'quiz',
      content_id: quizId,
      module_id: String(module.id),
      duration_seconds: 0,
      ...classify(agent),
      payload: answer
    });
    try { await insert('logs', { user_id: session.id, event: 'quiz_answer', module: quizId, device: agent }); } catch {}
    return respond(res, 200, { ok: true, isCorrect, correctIndex, correctAnswer: answer.correctAnswer, explanation: String(question.explanation || '') , eventId: rowsInserted?.[0]?.id || null });
  } catch (error) {
    console.error('Verified quiz answer failed:', error?.status || '', error?.message || 'Unknown error');
    return respond(res, 500, { error: 'Unable to check and save this answer. Please try again.' });
  }
}
