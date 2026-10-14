import { requireSession } from '../../server/lib/session.js';
import { selectAll } from '../../server/lib/db.js';

function csvCell(value) {
  let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Prevent spreadsheet formula execution when an exported text cell starts with a formula marker.
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
function toCsv(rows) {
  if (!rows.length) return 'No records\r\n';
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [keys.map(csvCell).join(','), ...rows.map((row) => keys.map((key) => csvCell(row[key])).join(','))].join('\r\n');
}
function toXls(rows, title) {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value) => String(value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title></head><body><table border="1"><thead><tr>${keys.map((k) => `<th>${escape(k)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${keys.map((k) => `<td style="mso-number-format:'\\@'">${escape(row[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
}
function stripSecrets(users) {
  return users.map(({ password_hash, ...user }) => user);
}
function tabularRows(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, rows]) => Array.isArray(rows));
    if (entries.length) {
      return entries.flatMap(([recordType, records]) => records.map((record) => ({ record_type: recordType, ...record })));
    }
    return [value];
  }
  return [{ value }];
}
async function dataset(name) {
  if (name === 'doctors') {
    const rows = await selectAll('users', 'select=id,name,email,phone,degree,specialization,experience,hospital,registration_number,state,city,status,last_login,session_duration,score,streak,password_set_at,phone_verified,welcome_email_opt_in,welcome_email_status,created_at,updated_at&role=eq.doctor&order=created_at.desc', { maxRows: 50000 });
    return rows;
  }
  if (name === 'registrations') {
    return selectAll('registration_audit', 'select=id,user_id,name,email,phone,degree,specialization,hospital,registration_number,city,state,registered_at,captured_at&order=registered_at.desc', { maxRows: 50000 });
  }
  if (name === 'events') {
    return selectAll('analytics_events', 'select=id,user_id,session_id,event_name,route,content_type,content_id,module_id,duration_seconds,device_type,browser,os,payload,created_at&order=created_at.desc', { maxRows: 50000 });
  }
  if (name === 'question-answers') {
    const [events, doctors] = await Promise.all([
      selectAll('analytics_events', 'select=id,user_id,session_id,module_id,content_id,payload,device_type,browser,os,created_at&event_name=eq.quiz_answer&order=created_at.desc', { maxRows: 50000 }),
      selectAll('users', 'select=id,name,email&role=eq.doctor', { maxRows: 20000 })
    ]);
    const byId = new Map((doctors || []).map((doctor) => [String(doctor.id), doctor]));
    return (events || []).map((event) => {
      const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
      const doctor = byId.get(String(event.user_id)) || {};
      return {
        answered_at: event.created_at, doctor_id: event.user_id, doctor_name: doctor.name || 'Unknown doctor',
        doctor_email: doctor.email || '', session_id: event.session_id || '', module_id: event.module_id || '',
        quiz_id: event.content_id || '', question_index: Number(payload.questionIndex) + 1, question_id: payload.questionId || '', correct_index: Number.isInteger(Number(payload.correctIndex)) ? Number(payload.correctIndex) : '',
        question: payload.question || '', options: Array.isArray(payload.options) ? payload.options.join(' | ') : '', selected_answer: payload.selectedAnswer || '', correct_answer: payload.correctAnswer || '',
        is_correct: payload.isCorrect === true, device: event.device_type || '', browser: event.browser || '', operating_system: event.os || ''
      };
    });
  }
  if (name === 'quiz-attempts') {
    return selectAll('quiz_attempts', 'select=id,user_id,quiz_id,quiz_title,total_questions,answers,score,percentage,passed,duration_seconds,created_at&order=created_at.desc', { maxRows: 50000 });
  }
  if (name === 'logs') {
    return selectAll('logs', 'select=id,user_id,event,module,device,created_at&order=created_at.desc', { maxRows: 50000 });
  }
  if (name === 'content') {
    const rows = await selectAll('app_content', 'select=key,payload,updated_at', { maxRows: 500 });
    return rows.map((row) => ({ key: row.key, updated_at: row.updated_at, payload: row.payload }));
  }
  if (name === 'all') {
    const [doctors, registrations, events, attempts, logs, content] = await Promise.all([
      dataset('doctors'), dataset('registrations'), dataset('events'), dataset('quiz-attempts'), dataset('logs'), dataset('content')
    ]);
    return { exportedAt: new Date().toISOString(), note: 'Authentication secrets and password hashes are intentionally excluded. Registration snapshots omit passwords and hashes.', doctors, registrations, events, quizAttempts: attempts, logs, content };
  }
  throw new Error('Unsupported export dataset');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const session = requireSession(req, res, 'admin');
  if (!session) return;
  const kind = String(req.query?.dataset || 'all').toLowerCase();
  const format = String(req.query?.format || 'csv').toLowerCase();
  if (!['doctors', 'registrations', 'events', 'question-answers', 'quiz-attempts', 'logs', 'content', 'all'].includes(kind)) return res.status(400).json({ error: 'Unsupported export dataset' });
  if (!['csv', 'json', 'xls'].includes(format)) return res.status(400).json({ error: 'Choose CSV, Excel (.xls) or JSON.' });
  try {
    const rows = await dataset(kind);
    const safeRows = Array.isArray(rows) && kind === 'doctors' ? stripSecrets(rows) : rows;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="medneo-${kind}-${stamp}.json"`);
      return res.status(200).send(JSON.stringify(safeRows, null, 2));
    }
    if (format === 'xls') {
      const flatRows = tabularRows(safeRows);
      res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="medneo-${kind}-${stamp}.xls"`);
      return res.status(200).send(toXls(flatRows, `MedNeo ${kind} export`));
    }
    const flatRows = tabularRows(safeRows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="medneo-${kind}-${stamp}.csv"`);
    return res.status(200).send(`\ufeff${toCsv(flatRows)}`);
  } catch {
    return res.status(500).json({ error: 'Export failed. Confirm the analytics migration has been applied.' });
  }
}
