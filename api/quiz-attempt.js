import { requireSession } from '../server/lib/session.js';
import { select, insert, update } from '../server/lib/db.js';

function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  return res.status(status).json(body);
}
function classifyAgent(agent) {
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
    const quizId = String(req.body?.quizId || '').trim().slice(0, 160);
    const clientAnswers = Array.isArray(req.body?.answers) ? req.body.answers : [];
    const durationSeconds = Math.max(0, Math.min(36000, Math.floor(Number(req.body?.durationSeconds) || 0)));
    if (!quizId) return respond(res, 400, { error: 'Assessment identifier is missing. Reopen the assessment and try again.' });

    const contentRows = await select('app_content', 'select=payload&key=eq.main&limit=1');
    const payload = contentRows?.[0]?.payload;
    const quiz = payload?.quizzes?.[quizId];
    if (!quiz || !Array.isArray(quiz.questions) || quiz.questions.length !== 5) {
      return respond(res, 409, { error: 'This module assessment is not ready. The administrator must publish exactly 5 questions.' });
    }
    const module = (payload.modules || []).find((item) => (item.contents || []).some((content) => String(content.id) === quizId));
    if (!module || module.status !== 'active') return respond(res, 403, { error: 'This assessment is not currently published.' });
    if (clientAnswers.length !== quiz.questions.length) return respond(res, 400, { error: 'Answer all 5 questions before viewing your result.' });

    const answerByIndex = new Map();
    for (const item of clientAnswers) {
      const qIndex = Number(item?.q ?? item?.questionIndex);
      const selectedIndex = Number(item?.selected ?? item?.selectedIndex);
      if (!Number.isInteger(qIndex) || qIndex < 0 || qIndex >= quiz.questions.length || !Number.isInteger(selectedIndex) || answerByIndex.has(qIndex)) {
        return respond(res, 400, { error: 'The submitted answers are invalid. Restart the assessment and try again.' });
      }
      answerByIndex.set(qIndex, selectedIndex);
    }
    const answers = [];
    for (let index = 0; index < quiz.questions.length; index += 1) {
      const question = quiz.questions[index];
      const selectedIndex = answerByIndex.get(index);
      const options = Array.isArray(question.options) ? question.options.map((x) => String(x ?? '')) : [];
      const correctIndex = Number(question.correct);
      if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= options.length || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
        return respond(res, 409, { error: `Question ${index + 1} is not configured correctly. Ask the administrator to review the question bank.` });
      }
      answers.push({
        questionIndex: index,
        questionId: String(question.id || `q${index + 1}`),
        question: String(question.question || ''),
        options,
        selectedIndex,
        selectedAnswer: options[selectedIndex],
        correctIndex,
        correctAnswer: options[correctIndex],
        isCorrect: selectedIndex === correctIndex,
        explanation: String(question.explanation || '')
      });
    }
    const score = answers.filter((answer) => answer.isCorrect).length;
    const totalQuestions = answers.length;
    const percentage = Math.round((score / totalQuestions) * 10000) / 100;
    const passed = percentage >= Math.max(0, Math.min(100, Number(quiz.passingScore) || 70));
    const rows = await insert('quiz_attempts', {
      user_id: session.id,
      quiz_id: quizId,
      quiz_title: String(quiz.title || `${module.title || 'Module'} Assessment`).slice(0, 200),
      total_questions: totalQuestions,
      answers,
      score,
      percentage,
      passed,
      duration_seconds: durationSeconds,
      created_at: new Date().toISOString()
    });

    const agent = String(req.headers['user-agent'] || 'Unknown').slice(0, 180);
    try {
      await insert('analytics_events', {
        user_id: session.id,
        session_id: String(req.body?.sessionId || '').slice(0, 100) || null,
        event_name: 'quiz_complete',
        route: '/doctor-dashboard.html',
        content_type: 'quiz',
        content_id: quizId,
        module_id: String(module.id),
        duration_seconds: Math.min(3600, durationSeconds),
        ...classifyAgent(agent),
        payload: { score, totalQuestions, percentage, passed, durationSeconds, attemptId: rows?.[0]?.id || null }
      });
    } catch (error) {
      console.error('Quiz completion analytics insert failed:', error?.status || '', error?.message || 'Unknown error');
    }
    try { await insert('logs', { user_id: session.id, event: 'Quiz Complete', module: String(module.id), device: agent }); } catch {}
    try { await update('users', `id=eq.${encodeURIComponent(session.id)}`, { score: Math.round(percentage), updated_at: new Date().toISOString() }); } catch {}
    return respond(res, 201, { ok: true, attemptId: rows?.[0]?.id || null, score, totalQuestions, percentage, passed });
  } catch (error) {
    console.error('Quiz attempt save failed:', error?.status || '', error?.message || 'Unknown error');
    return respond(res, 500, { error: 'Unable to save this assessment attempt. Confirm quiz_attempts and analytics_events migrations are applied.' });
  }
}
