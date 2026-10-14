import { requireSession } from '../server/lib/session.js';
import { select, selectAll, supabaseFetch } from '../server/lib/db.js';

function publicUser(user) {
  const safe = { ...user };
  delete safe.password_hash;
  safe.modules = safe.modules || [];
  safe.completedModules = safe.completed_modules || [];
  safe.sessionDuration = safe.session_duration || '—';
  safe.lastLogin = safe.last_login || '—';
  delete safe.completed_modules; delete safe.session_duration; delete safe.last_login;
  return safe;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const session = requireSession(req, res);
  if (!session) return;
  try {
    const contentRows = await select('app_content', 'key=eq.main&select=payload,updated_at&limit=1');
    const basePayload = contentRows?.[0]?.payload || { modules: [], slideDecks: {}, articles: {}, quizzes: {}, stateCities: {} };
    const moduleFileRows = await select('module_files', 'select=public_id,module_id,original_filename,mime_type,file_size,active,created_at&active=eq.true&module_id=not.is.null&order=created_at.desc&limit=300');
    const visibleQuizzes = Object.fromEntries(Object.entries(basePayload.quizzes || {}).map(([quizId, bank]) => {
      if (!bank || typeof bank !== 'object') return [quizId, bank];
      const questions = (Array.isArray(bank.questions) ? bank.questions : []).slice(0, 5);
      return [quizId, { ...bank, questions: session.role === 'admin' ? questions : questions.map(({ correct, ...question }) => question) }];
    }));
    const payload = {
      ...basePayload,
      quizzes: visibleQuizzes,
      modules: (Array.isArray(basePayload.modules) ? basePayload.modules : []).map((module) => ({
        ...module,
        quizId: (module.contents || []).find((item) => item.type === 'mcq')?.id || (module.id === 'm1' ? 'mq1' : `${module.id}_quiz`),
        quizBank: (() => {
          const quizId = (module.contents || []).find((item) => item.type === 'mcq')?.id || (module.id === 'm1' ? 'mq1' : `${module.id}_quiz`);
          const bank = basePayload.quizzes?.[quizId] || null;
          if (!bank) return null;
          const questions = (Array.isArray(bank.questions) ? bank.questions : []).slice(0, 5);
          if (session.role === 'admin') return { ...bank, questions };
          return { ...bank, questions: questions.map(({ correct, ...question }) => question) };
        })(),
        contents: (module.contents || []).map((item) => {
          if (item.type !== 'mcq') return item;
          const quizId = item.id || (module.id === 'm1' ? 'mq1' : `${module.id}_quiz`);
          const bank = basePayload.quizzes?.[quizId];
          return { ...item, questions: Math.min(5, Array.isArray(bank?.questions) ? bank.questions.length : 0) };
        }),
        presentations: (moduleFileRows || []).filter((file) => String(file.module_id) === String(module.id)).map((file) => ({
          id: file.public_id, filename: file.original_filename || 'Module presentation',
          mimeType: file.mime_type || 'Presentation', size: Number(file.file_size) || 0, uploadedAt: file.created_at
        }))
      }))
    };
    if (session.role !== 'admin') {
      const users = await select('users', `select=id,name,email,role,status,phone,state,city,specialization,experience,degree,hospital,registration_number,last_login,session_duration,modules,completed_modules,onboarded,score,streak,created_at,updated_at&id=eq.${encodeURIComponent(session.id)}&limit=1`);
      const safeUsers = (users || []).map(publicUser);
      const doctorQuizzes = visibleQuizzes;
      return res.status(200).json({ ...payload, quizzes: doctorQuizzes, users: safeUsers, logs: [], contentUpdatedAt: contentRows?.[0]?.updated_at || null, serverTime: new Date().toISOString() });
    }
    const [rawUsers, rawEvents, rawAttempts, rawLogs, rawRegistrations, analytics] = await Promise.all([
      selectAll('users', 'select=id,name,email,role,status,phone,state,city,specialization,experience,degree,hospital,registration_number,last_login,session_duration,modules,completed_modules,onboarded,score,streak,created_at,updated_at&order=created_at.desc', { maxRows: 20000 }),
      select('analytics_events', 'select=id,user_id,session_id,event_name,route,content_type,content_id,module_id,duration_seconds,device_type,browser,os,payload,created_at&order=created_at.desc&limit=500'),
      select('quiz_attempts', 'select=id,user_id,quiz_id,quiz_title,total_questions,answers,score,percentage,passed,duration_seconds,created_at&order=created_at.desc&limit=100'),
      selectAll('logs', 'select=id,user_id,event,module,device,created_at&order=created_at.desc', { maxRows: 1000 }),
      select('registration_audit', 'select=id,user_id,name,email,phone,degree,specialization,hospital,registration_number,city,state,registered_at,captured_at&order=registered_at.desc&limit=500'),
      supabaseFetch('/rest/v1/rpc/admin_analytics_snapshot', { method: 'POST', body: '{}' })
    ]);
    const users = rawUsers.map(publicUser);
    const userById = new Map(users.map((user) => [user.id, user]));
    const quizAttempts = rawAttempts.map((attempt) => ({ ...attempt, doctorName: userById.get(attempt.user_id)?.name || 'Unknown doctor', doctorEmail: userById.get(attempt.user_id)?.email || '' }));
    const logs = rawLogs.map((log) => ({ time: log.created_at, user: log.user_id, userName: userById.get(log.user_id)?.name || 'System', event: log.event, module: log.module || '—', device: log.device || '—' }));
    const events = rawEvents.map((event) => ({ ...event, userName: userById.get(event.user_id)?.name || 'Unknown doctor' }));
    return res.status(200).json({ ...payload, users, logs, events, quizAttempts, registrationAudit: rawRegistrations || [], analytics: analytics || {}, contentUpdatedAt: contentRows?.[0]?.updated_at || null, serverTime: new Date().toISOString() });
  } catch {
    return res.status(500).json({ error: 'Unable to load live server data. Confirm the database migration has been applied.' });
  }
}
