import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const syntaxFiles = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(?:mjs|js)$/.test(entry.name)) syntaxFiles.push(full);
  }
}
for (const directory of ['api', 'js', 'scripts', 'server']) walk(path.join(root, directory));
let failed = false;
for (const file of syntaxFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) { failed = true; process.stderr.write(`Syntax failed: ${path.relative(root, file)}\n${result.stderr || result.stdout}`); }
}
const sql = fs.readFileSync(path.join(root, 'supabase.sql'), 'utf8');
const adminJs = fs.readFileSync(path.join(root, 'js', 'admin.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'admin-dashboard.html'), 'utf8');
const backup = fs.readFileSync(path.join(root, 'server', 'lib', 'backup.js'), 'utf8');
const exportApi = fs.readFileSync(path.join(root, 'api', 'admin', 'export.js'), 'utf8');
const profileApi = fs.readFileSync(path.join(root, 'api', 'doctor', 'profile.js'), 'utf8');
const seed = fs.readFileSync(path.join(root, 'scripts', 'seed.mjs'), 'utf8');
const registerApiPath = path.join(root, 'api', 'auth', 'register.js');
const registerApi = fs.existsSync(registerApiPath) ? fs.readFileSync(registerApiPath, 'utf8') : '';
const clientRegistration = fs.readFileSync(path.join(root, 'js', 'registration.js'), 'utf8');
const authClient = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');
const setupApi = fs.readFileSync(path.join(root, 'api', 'auth', 'password-setup.js'), 'utf8');
const setupHtml = fs.readFileSync(path.join(root, 'set-password.html'), 'utf8');
const activeHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const oldHtml = fs.readFileSync(path.join(root, 'indexbad.html'), 'utf8');
const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
const answerApiPath = path.join(root, 'api', 'quiz-answer.js');
const answerApi = fs.existsSync(answerApiPath) ? fs.readFileSync(answerApiPath, 'utf8') : '';
const answerEventsApiPath = path.join(root, 'api', 'admin', 'question-answers.js');
const answerEventsApi = fs.existsSync(answerEventsApiPath) ? fs.readFileSync(answerEventsApiPath, 'utf8') : '';
const dataApi = fs.readFileSync(path.join(root, 'api', 'data.js'), 'utf8');
const forgotApiPath = path.join(root, 'api', 'auth', 'forgot-password.js');
const resetApiPath = path.join(root, 'api', 'auth', 'reset-password.js');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const files = [];
function allFiles(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) allFiles(full); else files.push(full); } }
allFiles(path.join(root, 'api')); allFiles(path.join(root, 'js')); allFiles(path.join(root, 'server'));
const activeSource = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const checks = [
  ['analytics schema exists', /create table if not exists public\.analytics_events/i.test(sql)],
  ['quiz attempt schema exists', /create table if not exists public\.quiz_attempts/i.test(sql)],
  ['admin login throttling schema exists', /create table if not exists public\.auth_attempts/i.test(sql)],
  ['registration throttling schema exists', /create table if not exists public\.registration_attempts/i.test(sql)],
  ['all-time SQL analytics aggregate exists', /create or replace function public\.admin_analytics_snapshot/i.test(sql)],
  ['analytics does not use fake 73 percent metric', !/textContent\s*=\s*['"]73%['"]/.test(adminJs)],
  ['admin dashboard has no demo analytics fallback', !/12,400|10,832|8,248|6,512|4,340/.test(adminHtml)],
  ['seed preserves published content on rerun', /skipping content seed to protect published articles/i.test(seed)],
  ['admin exports and backups remain available', /exportAdminData\('all','csv'\)/.test(adminHtml) && /runDatabaseBackup\(\)/.test(adminHtml)],
  ['password-only registration API exists', fs.existsSync(registerApiPath) && /hashPassword\(password\)/.test(registerApi) && /setSessionCookie\(res, createSession\(safe\)\)/.test(registerApi)],
  ['registration persists only password hash, never plaintext', /password_hash:\s*passwordHash/.test(registerApi) && !/password:\s*password\s*[,}]/.test(registerApi)],
  ['registration rate limits hash identifiers', /registration_attempts/.test(registerApi) && /registration-email:/.test(registerApi) && /registration-ip:/.test(registerApi)],
  ['optional welcome email is provider-configured', /welcome_email_opt_in/.test(sql) && /RESEND_API_KEY/.test(fs.readFileSync(path.join(root, 'server', 'lib', 'email.js'), 'utf8'))],
  ['active auth uses doctor email and password', /doctorPasswordForm/.test(activeHtml) && /handleDoctorPasswordLogin/.test(authClient) && !/doctorOtpLoginMode|Phone OTP|Send OTP/.test(activeHtml)],
  ['registration pages keep password UX and no OTP UI', /Create account securely/.test(activeHtml) && /regConfirmPassword/.test(oldHtml) && !/registrationOtpStep|one-time code sent|Continue to phone verification/.test(activeHtml + oldHtml + fs.readFileSync(path.join(root, 'indexbadapi.html'), 'utf8'))],
  ['active auth routes and UI are free of Twilio integration', !/TWILIO_|twilio-verify|\/api\/auth\/otp|register\/start|register\/verify|phone OTP/i.test(activeSource + envExample + fs.readFileSync(path.join(root, 'js', 'admin.js'), 'utf8'))],
  ['admin-created doctors can set their own password by expiring one-time link', /password_setup_tokens/.test(sql) && /password_setup_tokens/.test(setupApi) && /set-password.html\?token=/.test(fs.readFileSync(path.join(root, 'api', 'admin', 'invite.js'), 'utf8')) && /api\/auth\/password-setup/.test(setupHtml)],
  ['accessibility tools remain in login page', /contrastToggleBtn/.test(activeHtml) && /fontLargerBtn/.test(activeHtml)],
  ['no-store headers apply to all routes', fs.readFileSync(path.join(root, 'vercel.json'), 'utf8').includes('"source": "/(.*)"')],
  ['backup is chunked and includes a manifest', /PAGE_SIZE\s*=\s*1000/.test(backup) && /manifest\.json/.test(backup)],
  ['backup includes password-only registration and setup-token tables', /registration_attempts/.test(backup) && /password_setup_tokens/.test(backup) && !/otp_send_events|otp_verify_events/.test(backup)],
  ['all-data spreadsheet export is flattened', /function tabularRows/.test(exportApi) && /record_type/.test(exportApi)],
  ['phone change remains admin-verified', /changing the sign-in mobile requires administrator verification/i.test(profileApi)],
  ['daily analytics uses India day boundaries', /Asia\/Kolkata/.test(sql)],
  ['schema and content seed are non-destructive', !/\b(drop table|truncate|delete from public\.app_content)\b/i.test(sql) && !/\bdelete from\b/i.test(seed)],
  ['all three named modules are activated additively', /'m1','m2','m3'/.test(sql) && /foreach v_module in array v_definitions/i.test(sql) && /status.*active/s.test(sql) && ['m1','m2','m3'].every(id => new RegExp(`id: '${id}'`).test(fs.readFileSync(path.join(root, 'js', 'data.legacy.js'), 'utf8')))],
  ['PPT publishing and question-bank editing exist for all three modules', /ALLOWED_MODULES.*m1.*m2.*m3/s.test(fs.readFileSync(path.join(root, 'api', 'admin', 'module-publish.js'), 'utf8')) && /Manage assessment questions and answers/.test(adminJs) && /module-quiz/.test(adminJs)],
  ['question answers are server-verified and individually persisted', fs.existsSync(answerApiPath) && /payload\?\.quizzes/.test(answerApi) && /insert\('analytics_events'/.test(answerApi) && /api\/quiz-answer/.test(fs.readFileSync(path.join(root, 'js', 'doctor.js'), 'utf8'))],
  ['doctor bootstrap does not expose answer keys before a choice', dataApi.includes('map(({ correct, ...question }) => question)') && /const doctorQuizzes/.test(dataApi)],
  ['admin displays all choices and exports individual quiz answers', fs.existsSync(answerEventsApiPath) && /questionAnswerEventsTableBody/.test(adminHtml) && /Available options/.test(adminHtml) && /row.options/.test(adminJs) && /loadQuestionAnswerEvents/.test(adminJs) && /question-answers/.test(exportApi)],
  ['forgot-password flow has UI, email endpoint and token consume endpoint', fs.existsSync(forgotApiPath) && fs.existsSync(resetApiPath) && fs.existsSync(path.join(root, 'reset-password.html')) && /Forgot password\?/.test(activeHtml) && /sendPasswordResetEmail/.test(fs.readFileSync(path.join(root, 'server', 'lib', 'email.js'), 'utf8'))],
  ['registration archive is backed up and trigger captures new doctors', /registration_audit/.test(sql) && /capture_doctor_registration_after_insert/.test(sql) && /registration_audit/.test(backup)],
  ['no WhatsApp provider implementation or instructions remain', !/whatsapp|wa\.me/i.test(activeSource + readme)],
  ['dashboard has no fabricated CME credit totals', !/class="analytics-value">4\.5<\//.test(fs.readFileSync(path.join(root, 'js', 'doctor.js'), 'utf8'))]
];
for (const [label, passed] of checks) { process.stdout.write(`${passed ? 'PASS' : 'FAIL'} ${label}\n`); if (!passed) failed = true; }
if (failed) process.exit(1);
process.stdout.write(`Checked ${syntaxFiles.length} JavaScript files.\n`);
