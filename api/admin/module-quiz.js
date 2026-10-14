import { requireSession } from '../../server/lib/session.js';
import { select, update, insert } from '../../server/lib/db.js';

const MODULES = new Set(['m1', 'm2', 'm3']);
function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  return res.status(status).json(body);
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });
  const session = requireSession(req, res, 'admin');
  if (!session) return;
  try {
    const moduleId = String(req.body?.moduleId || '');
    if (!MODULES.has(moduleId)) return respond(res, 400, { error: 'Choose one of the three published modules.' });
    const title = String(req.body?.title || '').trim().slice(0, 200);
    const rawQuestions = req.body?.questions;
    const passingScore = Math.max(0, Math.min(100, Number(req.body?.passingScore) || 70));
    if (!title) return respond(res, 400, { error: 'Enter an assessment title.' });
    if (!Array.isArray(rawQuestions) || rawQuestions.length !== 5) return respond(res, 400, { error: 'Each module assessment must contain exactly 5 questions.' });
    const questions = [];
    for (let index = 0; index < rawQuestions.length; index += 1) {
      const item = rawQuestions[index] || {};
      const question = String(item.question || '').trim().slice(0, 1200);
      const options = Array.isArray(item.options) ? item.options.map((option) => String(option ?? '').trim().slice(0, 500)) : [];
      const correct = Number(item.correct);
      if (question.length < 5 || options.length < 2 || options.length > 8 || options.some((option) => !option) || !Number.isInteger(correct) || correct < 0 || correct >= options.length) {
        return respond(res, 400, { error: `Question ${index + 1} needs a question, 2–8 options and a valid zero-based correct index.` });
      }
      questions.push({
        id: String(item.id || `q${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || `q${index + 1}`,
        question,
        options,
        correct,
        explanation: String(item.explanation || '').trim().slice(0, 3000)
      });
    }
    const contentRows = await select('app_content', 'select=key,payload&key=eq.main&limit=1');
    if (!contentRows?.[0]?.payload) return respond(res, 409, { error: 'Live content is not initialized. Run the content seed first.' });
    const payload = contentRows[0].payload;
    if (!payload.quizzes || typeof payload.quizzes !== 'object') payload.quizzes = {};
    const modules = Array.isArray(payload.modules) ? payload.modules : [];
    const target = modules.find((module) => String(module.id) === moduleId);
    if (!target) return respond(res, 404, { error: 'Module not found in live content.' });
    const quizId = (target.contents || []).find((item) => item.type === 'mcq')?.id || (moduleId === 'm1' ? 'mq1' : `${moduleId}_quiz`);
    payload.quizzes[quizId] = { id: quizId, title, passingScore, questions };
    const contents = Array.isArray(target.contents) ? [...target.contents] : [];
    const resource = { type: 'mcq', id: quizId, title, duration: Math.max(1, Math.min(600, Number(req.body?.duration) || 15)), questions: questions.length };
    const oldIndex = contents.findIndex((item) => item.type === 'mcq');
    if (oldIndex >= 0) contents[oldIndex] = { ...contents[oldIndex], ...resource };
    else contents.push(resource);
    target.contents = contents;
    target.status = 'active';
    const now = new Date().toISOString();
    const updated = await update('app_content', 'key=eq.main', { payload, updated_at: now });
    if (!Array.isArray(updated) || updated.length === 0) return respond(res, 500, { error: 'Assessment could not be saved to live Supabase content.' });
    try { await insert('logs', { user_id: session.id, event: 'Assessment question bank published', module: moduleId, device: String(req.headers['user-agent'] || 'Unknown').slice(0, 180) }); } catch {}
    return respond(res, 200, { ok: true, moduleId, quizId, questionCount: questions.length, message: `${title} saved to live Supabase content with ${questions.length} questions.` });
  } catch (error) {
    console.error('Module quiz save failed:', error?.status || '', error?.message || 'Unknown error');
    return respond(res, 500, { error: 'Unable to save the question bank. Check the live Supabase schema and try again.' });
  }
}
