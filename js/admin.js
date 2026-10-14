/* Live admin console. Metrics are computed only from persisted server events. */
let allUsers = [];
let filteredUsers = [];
let userPage = 1;
let currentAdminSection = 'overview';
let refreshInFlight = false;
let attemptsNextOffset = 0;
let attemptsLoading = false;
let attemptsHasMore = false;
let questionAnswerEvents = [];
let questionAnswerOffset = 0;
let questionAnswerHasMore = true;
let questionAnswerLoading = false;
let questionAnswerEventsLoaded = false;
const PAGE_SIZE = 8;
const REFRESH_INTERVAL_MS = 30000;

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
const dateLabel = (value) => {
  if (!value || value === '—') return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? escapeHTML(value) : escapeHTML(date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }));
};
const numberLabel = (value) => (Number(value) || 0).toLocaleString('en-IN');
const userById = (id) => allUsers.find((user) => String(user.id) === String(id));

 document.addEventListener('DOMContentLoaded', async () => {
  const admin = await authGuard('admin');
  if (!admin) return;

  syncUsers();
  const currentDate = document.getElementById('currentDate');
  if (currentDate) currentDate.textContent = formatDate();
  document.querySelectorAll('.user-avatar, .header-avatar').forEach((el) => { el.textContent = 'SA'; });
  const nameEl = document.getElementById('sidebarUserName');
  if (nameEl) nameEl.textContent = 'Super Admin';
  const specEl = document.getElementById('sidebarUserSpec');
  if (specEl) specEl.textContent = 'Administrator';

  initNav(onSectionSwitch);
  initSidebarToggle();
  initLogout();
  document.getElementById('userSearchInput')?.addEventListener('input', (event) => {
    const query = String(event.target.value || '').toLowerCase().trim();
    filteredUsers = query ? allUsers.filter((user) => [user.name, user.email, user.specialization, user.degree, user.hospital, user.phone].some((field) => String(field || '').toLowerCase().includes(query))) : [...allUsers];
    userPage = 1;
    renderUsersTable();
  });

  attemptsNextOffset = (DB.quizAttempts || []).length;
  attemptsHasMore = attemptsNextOffset >= 100;
  renderOverview();
  renderAnalytics();
  renderRegistrationArchive();
  window.setInterval(() => refreshAnalyticsNow({ quiet: true }), REFRESH_INTERVAL_MS);
  window.addEventListener('focus', () => refreshAnalyticsNow({ quiet: true }));
});

function syncUsers() {
  allUsers = (DB.users || []).filter((user) => user.role === 'doctor');
  const search = String(document.getElementById('userSearchInput')?.value || '').toLowerCase().trim();
  filteredUsers = search ? allUsers.filter((user) => [user.name, user.email, user.specialization, user.degree, user.hospital, user.phone].some((field) => String(field || '').toLowerCase().includes(search))) : [...allUsers];
}

function onSectionSwitch(section) {
  currentAdminSection = section;
  if (section === 'overview') renderOverview();
  if (section === 'analytics') renderAnalytics();
  if (section === 'users') { renderUsersTable(); renderRegistrationArchive(); }
  if (section === 'modules') renderModulesGrid();
  if (section === 'logs') renderLogs();
}

async function refreshAnalyticsNow(options = {}) {
  if (refreshInFlight) return;
  refreshInFlight = true;
  try {
    await refreshServerData();
    attemptsNextOffset = (DB.quizAttempts || []).length;
    attemptsHasMore = attemptsNextOffset >= 100;
    syncUsers();
    renderOverview();
    renderAnalytics();
    if (currentAdminSection === 'analytics' && questionAnswerEventsLoaded && questionAnswerOffset <= 100 && !questionAnswerLoading) await loadQuestionAnswerEvents(true, true);
    if (currentAdminSection === 'users') { renderUsersTable(); renderRegistrationArchive(); }
    if (currentAdminSection === 'modules') renderModulesGrid();
    if (currentAdminSection === 'logs') renderLogs();
    const updated = document.getElementById('analyticsUpdatedAt');
    if (updated) updated.textContent = `Last updated ${new Date().toLocaleTimeString('en-IN')} · next refresh in 30 seconds`;
  } catch (error) {
    const updated = document.getElementById('analyticsUpdatedAt');
    if (updated) updated.textContent = 'Live refresh failed. Check the connection and database migration.';
    if (!options.quiet) showToast(error.message || 'Unable to refresh live analytics.', 'error');
  } finally {
    refreshInFlight = false;
  }
}

function makeDailySeries(values, length = 14) {
  const list = Array.isArray(values) ? values.slice(-length) : [];
  while (list.length < length) list.unshift(0);
  return list.map((value) => Number(value) || 0);
}

function buildMiniChart(id, values) {
  const element = document.getElementById(id);
  if (!element) return;
  const data = makeDailySeries(values);
  const max = Math.max(1, ...data);
  element.innerHTML = data.map((value, index) => {
    const height = value ? Math.max(3, Math.round((value / max) * 100)) : 2;
    const label = ANALYTICS.dailyLabels?.slice(-data.length)?.[index] || `Day ${index + 1}`;
    return `<div class="mini-bar ${value === max && value > 0 ? 'peak' : ''}" style="height:${height}%" title="${escapeHTML(label)}: ${value}"></div>`;
  }).join('');
}

function renderOverview() {
  const totals = ANALYTICS?.totals || {};
  const active = Number(totals.activeDoctorsToday) || 0;
  animateCounter(document.getElementById('kpiUsers'), Number.isFinite(Number(totals.registeredDoctors)) ? Number(totals.registeredDoctors) : allUsers.length, 350);
  animateCounter(document.getElementById('kpiActive'), active, 350);
  animateCounter(document.getElementById('kpiModules'), (DB.modules || []).filter((module) => module.status === 'active').length, 350);
  const opens = Number(totals.articleOpens) || 0;
  const completes = Number(totals.articleCompletions) || 0;
  const completion = opens ? Math.round(completes / opens * 100) : null;
  const completionEl = document.getElementById('kpiCompletion');
  if (completionEl) completionEl.textContent = completion == null ? '—' : `${completion}%`;
  const moduleSub = document.getElementById('kpiModulesSub');
  if (moduleSub) moduleSub.textContent = `${(DB.modules || []).filter((module) => module.status === 'active').length} currently published`;
  const completionSub = document.getElementById('kpiCompletionSub');
  if (completionSub) completionSub.textContent = opens ? `${numberLabel(completes)} completed from ${numberLabel(opens)} opens` : 'No article completion data yet';
  buildMiniChart('regChart', ANALYTICS?.registrations || []);
  renderOnlineUsers();
  renderModPerf();
}

function renderOnlineUsers() {
  const element = document.getElementById('onlineList');
  if (!element) return;
  const cutoff = Date.now() - 2 * 60 * 1000;
  const seen = new Map();
  for (const event of DB.events || []) {
    if (!['session_start', 'session_heartbeat', 'section_view', 'module_open', 'article_open', 'content_click'].includes(event.event_name) || !event.user_id) continue;
    const timestamp = new Date(event.created_at).getTime();
    if (Number.isFinite(timestamp) && timestamp >= cutoff) {
      const previous = seen.get(event.user_id);
      if (!previous || timestamp > previous.timestamp) seen.set(event.user_id, { timestamp, event });
    }
  }
  const online = [...seen.entries()].sort((a, b) => b[1].timestamp - a[1].timestamp).slice(0, 6);
  element.innerHTML = online.map(([id, detail]) => {
    const user = userById(id);
    return `<div class="online-item"><div class="online-dot"></div><span class="online-name">${escapeHTML(user?.name || detail.event.userName || 'Doctor')}</span><span class="online-time">${Math.max(0, Math.floor((Date.now() - detail.timestamp) / 1000))}s ago</span></div>`;
  }).join('') || '<div class="analytics-empty">No active sessions detected in the last two minutes.</div>';
}

function renderModPerf() {
  const element = document.getElementById('modPerfList');
  if (!element) return;
  const modules = DB.modules || [];
  element.innerHTML = modules.map((module) => {
    const moduleEvents = (DB.events || []).filter((event) => String(event.module_id || event.content_id || '') === String(module.id));
    const opens = moduleEvents.filter((event) => event.event_name === 'module_open' || event.event_name === 'content_click' || event.event_name === 'article_open').length;
    const completions = moduleEvents.filter((event) => event.event_name === 'article_complete').length;
    const rate = opens ? Math.round(completions / opens * 100) : null;
    return `<div class="mod-perf-item"><div class="mod-perf-icon">${escapeHTML(module.icon || '📚')}</div><div class="mod-perf-info"><div class="mod-perf-name">${escapeHTML(module.title)}</div><div class="mod-perf-meta">${numberLabel(opens)} recorded opens · ${Number(module.duration) || 0} min</div></div><div class="mod-perf-rate">${rate == null ? '—' : `${rate}%`}</div></div>`;
  }).join('') || '<div class="analytics-empty">No modules are available in the current content.</div>';
}

function summaryCard(label, value, sub, icon) {
  return `<div class="kpi-card"><div class="kpi-icon">${icon}</div><div class="kpi-label">${escapeHTML(label)}</div><div class="kpi-value">${escapeHTML(value)}</div><div class="kpi-sub">${escapeHTML(sub || '')}</div></div>`;
}

function renderAnalytics() {
  const totals = ANALYTICS?.totals || {};
  const summary = document.getElementById('analyticsSummary');
  if (summary) summary.innerHTML = [
    summaryCard('Doctors active today', numberLabel(totals.activeDoctorsToday), 'Doctors with at least one event today', '👥'),
    summaryCard('Quiz attempts', numberLabel(totals.quizAttempts), 'Persisted assessment submissions', '📝'),
    summaryCard('Average quiz score', totals.quizAttempts ? `${numberLabel(totals.averageQuizScore)}%` : '—', totals.quizAttempts ? 'Across all submitted attempts' : 'No attempts recorded yet', '🎯'),
    summaryCard('Time spent', `${numberLabel(totals.totalMinutes)} min`, 'Sum of tracked active time', '⏱'),
    summaryCard('Article opens', numberLabel(totals.articleOpens), 'Recorded article openings', '📖'),
    summaryCard('Ad clicks', numberLabel(totals.adClicks), 'Only tracked tagged ads', '↗'),
    summaryCard('Content clicks', numberLabel(totals.contentClicks), 'Clicks recorded by the app', '🖱'),
    summaryCard('External link clicks', numberLabel(totals.externalLinkClicks), 'Tracked external destinations', '🔗')
  ].join('');

  buildMiniChart('dauChart', ANALYTICS?.dau || []);
  const dauEmpty = document.getElementById('dauEmpty');
  if (dauEmpty) dauEmpty.hidden = (ANALYTICS?.dau || []).some((value) => Number(value) > 0);
  renderDeviceDist();
  renderFunnel();
  renderNavPaths();
  renderTopContent();
  renderQuizAttempts();
  renderQuestionAnswerEvents();
  if (!questionAnswerEventsLoaded && !questionAnswerLoading) loadQuestionAnswerEvents(true, true);
}

function renderDeviceDist() {
  const element = document.getElementById('deviceList');
  if (!element) return;
  const groups = [
    { title: 'Device', rows: ANALYTICS?.deviceDist || [] },
    { title: 'Browser', rows: ANALYTICS?.browserDist || [] },
    { title: 'Operating system', rows: ANALYTICS?.osDist || [] }
  ];
  element.innerHTML = groups.map((group) => `<div style="font-size:.78rem;font-weight:700;color:var(--text-primary);margin:10px 0 6px">${escapeHTML(group.title)}</div>` + (group.rows.length ? group.rows.map((row) => `<div class="device-item"><div class="device-name">${escapeHTML(row.name)}</div><div class="device-bar-wrap"><div class="device-bar"><div class="device-fill" style="width:${Math.max(0, Math.min(100, Number(row.pct) || 0))}%"></div></div></div><div class="device-pct">${Math.max(0, Math.min(100, Number(row.pct) || 0))}%</div></div>`).join('') : '<div class="analytics-empty">No events recorded yet.</div>')).join('');
}

function renderFunnel() {
  const element = document.getElementById('funnelList');
  if (!element) return;
  const funnel = ANALYTICS?.completionFunnel || [];
  element.innerHTML = funnel.map((item) => `<div class="funnel-row"><div class="funnel-label">${escapeHTML(item.label)}</div><div class="funnel-bar-wrap"><div class="funnel-bar"><div class="funnel-fill" style="width:${Math.max(0, Math.min(100, Number(item.pct) || 0))}%"></div></div></div><div class="funnel-count">${numberLabel(item.count)}</div></div>`).join('') || '<div class="analytics-empty">The learning funnel will populate as doctors use the modules.</div>';
}

function renderNavPaths() {
  const body = document.getElementById('navPathsTableBody');
  if (!body) return;
  const rows = ANALYTICS?.navPaths || [];
  body.innerHTML = rows.map((item) => `<tr><td style="font-family:var(--font-mono);font-size:.8rem">${escapeHTML(item.route)}</td><td style="font-weight:600;color:var(--Alembic-red)">${numberLabel(item.count)}</td></tr>`).join('') || '<tr><td colspan="2" class="analytics-empty-cell">No page activity has been recorded yet.</td></tr>';
}

function renderTopContent() {
  const body = document.getElementById('topContentTableBody');
  if (!body) return;
  const rows = ANALYTICS?.topContent || [];
  body.innerHTML = rows.map((item) => `<tr><td>${escapeHTML(item.contentType || 'content')}</td><td>${escapeHTML(item.contentId || '—')}</td><td>${numberLabel(item.clicks)}</td><td>${dateLabel(item.lastSeen)}</td></tr>`).join('') || '<tr><td colspan="4" class="analytics-empty-cell">No clicks or content opens recorded yet. Add the tracking attributes to any advertisement that you want measured.</td></tr>';
}

function renderQuizAttempts() {
  const body = document.getElementById('quizAttemptsTableBody');
  if (!body) return;
  const attempts = DB.quizAttempts || [];
  body.innerHTML = attempts.map((attempt) => `<tr><td>${dateLabel(attempt.created_at)}</td><td>${escapeHTML(attempt.doctorName || userById(attempt.user_id)?.name || 'Doctor')}<div class="cell-name-sub">${escapeHTML(attempt.doctorEmail || '')}</div></td><td>${escapeHTML(attempt.quiz_title || attempt.quiz_id || 'Assessment')}</td><td>${numberLabel(attempt.score)}/${numberLabel(attempt.total_questions)} (${numberLabel(attempt.percentage)}%) · ${attempt.passed ? 'Passed' : 'Not passed'}</td><td>${numberLabel(attempt.duration_seconds)} sec</td><td><button class="btn btn-ghost" onclick="viewQuizAttempt('${String(attempt.id).replace(/[^0-9]/g, '')}')">View ${numberLabel(attempt.answers?.length || 0)} answers</button></td></tr>`).join('') || '<tr><td colspan="6" class="analytics-empty-cell">No assessment attempts recorded yet.</td></tr>';
  const loadButton = document.getElementById('loadMoreAttemptsBtn');
  if (loadButton) { loadButton.hidden = !attemptsHasMore || attemptsLoading; loadButton.disabled = attemptsLoading; loadButton.textContent = attemptsLoading ? 'Loading…' : 'Load older attempts'; }
  const loadedLabel = document.getElementById('attemptsLoadedLabel');
  if (loadedLabel) loadedLabel.textContent = `${numberLabel(attempts.length)} attempts loaded in this view · export to download the complete dataset`;
}

function renderQuestionAnswerEvents() {
  const body = document.getElementById('questionAnswerEventsTableBody');
  if (!body) return;
  body.innerHTML = questionAnswerEvents.map((row) => {
    const options = Array.isArray(row.options) ? row.options : [];
    const optionList = options.length ? `<ol style="padding-left:18px;margin:0;min-width:180px">${options.map((option, index) => `<li style="padding:2px 0;${index === Number(row.correctIndex) ? 'font-weight:700;color:#18804a' : ''}">${escapeHTML(option)}${index === Number(row.correctIndex) ? ' ✓' : ''}</li>`).join('')}</ol>` : '—';
    return `<tr><td>${dateLabel(row.created_at)}</td><td>${escapeHTML(row.doctorName || 'Unknown doctor')}<div class="cell-name-sub">${escapeHTML(row.doctorEmail || '')}</div></td><td>${escapeHTML(row.moduleId || '—')} / ${escapeHTML(row.quizId || '—')}</td><td>${escapeHTML(row.question || `Question ${(Number(row.questionIndex) || 0) + 1}`)}</td><td>${optionList}</td><td>${escapeHTML(row.selectedAnswer || '—')}</td><td>${escapeHTML(row.correctAnswer || '—')}</td><td><span class="badge ${row.isCorrect ? 'badge-active' : 'badge-muted'}">${row.isCorrect ? 'Correct' : 'Incorrect'}</span></td><td>${escapeHTML([row.device, row.browser, row.os].filter(Boolean).join(' · ') || '—')}</td></tr>`;
  }).join('') || '<tr><td colspan="9" class="analytics-empty-cell">No individual question answers recorded yet. This table populates as doctors answer real questions.</td></tr>';
  const button = document.getElementById('loadMoreQuestionAnswersBtn');
  if (button) { button.hidden = !questionAnswerHasMore || questionAnswerLoading; button.disabled = questionAnswerLoading; button.textContent = questionAnswerLoading ? 'Loading…' : 'Load older answers'; }
  const label = document.getElementById('questionAnswerEventsLoadedLabel');
  if (label) label.textContent = `${numberLabel(questionAnswerEvents.length)} individual answer events loaded`;
}

async function loadQuestionAnswerEvents(reset = false, quiet = false) {
  if (questionAnswerLoading) return;
  if (reset) { questionAnswerOffset = 0; questionAnswerHasMore = true; questionAnswerEvents = []; }
  if (!questionAnswerHasMore && !reset) return;
  questionAnswerLoading = true;
  renderQuestionAnswerEvents();
  try {
    const result = await api(`/api/admin/question-answers?offset=${questionAnswerOffset}&limit=100`, { cache: 'no-store' });
    const rows = Array.isArray(result.answers) ? result.answers : [];
    const seen = new Set(questionAnswerEvents.map((row) => String(row.id)));
    for (const row of rows) if (!seen.has(String(row.id))) questionAnswerEvents.push(row);
    questionAnswerOffset = Number(result.nextOffset) || (questionAnswerOffset + rows.length);
    questionAnswerHasMore = Boolean(result.hasMore);
    questionAnswerEventsLoaded = true;
  } catch (error) {
    questionAnswerEventsLoaded = false;
    if (!quiet) showToast(error.message || 'Unable to load question-answer events.', 'error', 5000);
  } finally {
    questionAnswerLoading = false;
    renderQuestionAnswerEvents();
  }
}

async function loadMoreQuestionAnswerEvents() {
  await loadQuestionAnswerEvents(false, false);
}

async function loadMoreQuizAttempts() {
  if (attemptsLoading || !attemptsHasMore) return;
  attemptsLoading = true;
  renderQuizAttempts();
  try {
    const result = await api(`/api/admin/quiz-attempts?offset=${attemptsNextOffset}&limit=100`, { cache: 'no-store' });
    const rows = Array.isArray(result.attempts) ? result.attempts : [];
    const known = new Set((DB.quizAttempts || []).map((attempt) => String(attempt.id)));
    for (const row of rows) {
      const user = userById(row.user_id);
      row.doctorName = user?.name || 'Unknown doctor';
      row.doctorEmail = user?.email || '';
      if (!known.has(String(row.id))) DB.quizAttempts.push(row);
    }
    attemptsNextOffset += rows.length;
    attemptsHasMore = Boolean(result.hasMore);
  } catch (error) {
    showToast(error.message || 'Unable to load older assessment attempts.', 'error');
  } finally {
    attemptsLoading = false;
    renderQuizAttempts();
  }
}

function viewQuizAttempt(id) {
  const attempt = (DB.quizAttempts || []).find((item) => String(item.id) === String(id));
  if (!attempt) { showToast('Attempt is no longer present in the current data snapshot.', 'info'); return; }
  const title = document.getElementById('quizAttemptModalTitle');
  const body = document.getElementById('quizAttemptModalBody');
  if (title) title.textContent = `${attempt.quiz_title || attempt.quiz_id} · ${attempt.doctorName || userById(attempt.user_id)?.name || 'Doctor'}`;
  if (body) {
    body.innerHTML = `<div style="margin-bottom:16px;color:var(--text-muted)">Submitted ${dateLabel(attempt.created_at)} · Score ${numberLabel(attempt.score)}/${numberLabel(attempt.total_questions)} (${numberLabel(attempt.percentage)}%) · ${numberLabel(attempt.duration_seconds)} seconds</div>` + (attempt.answers || []).map((answer, index) => { const options = Array.isArray(answer.options) ? answer.options : []; return `<div class="card" style="padding:16px;margin-bottom:12px"><div style="font-weight:650;margin-bottom:10px">${index + 1}. ${escapeHTML(answer.question || `Question ${index + 1}`)}</div>${options.length ? `<ol style="margin:0 0 12px 20px;padding:0">${options.map((option, optionIndex) => `<li style="padding:4px 0;color:${optionIndex === Number(answer.correctIndex) ? '#18804a' : optionIndex === Number(answer.selectedIndex) ? '#b42318' : 'var(--text-primary)'};font-weight:${optionIndex === Number(answer.correctIndex) || optionIndex === Number(answer.selectedIndex) ? '650' : '400'}">${escapeHTML(option)}${optionIndex === Number(answer.selectedIndex) ? ' — Doctor selected' : ''}${optionIndex === Number(answer.correctIndex) ? ' — Correct answer' : ''}</li>`).join('')}</ol>` : `<div style="font-size:.9rem;margin-bottom:6px">Selected: <strong>${escapeHTML(answer.selectedAnswer ?? '—')}</strong></div><div style="font-size:.9rem;color:var(--text-muted)">Correct answer: ${escapeHTML(answer.correctAnswer ?? 'Not recorded')}</div>`}<div style="margin-top:8px;font-weight:600;color:${answer.isCorrect ? '#18804a' : '#b42318'}">${answer.isCorrect ? 'Correct' : 'Incorrect'}</div></div>`; }).join('') || '<div class="analytics-empty">No per-question answers were saved for this attempt.</div>';
  }
  openModal('quizAttemptModal');
}

function exportAdminData(dataset = 'all', format = 'csv') {
  const allowedDatasets = ['all', 'doctors', 'registrations', 'events', 'question-answers', 'quiz-attempts', 'logs', 'content'];
  const allowedFormats = ['csv', 'json', 'xls'];
  if (!allowedDatasets.includes(dataset) || !allowedFormats.includes(format)) return;
  window.location.href = `/api/admin/export?dataset=${encodeURIComponent(dataset)}&format=${encodeURIComponent(format)}`;
}

async function runDatabaseBackup() {
  const button = [...document.querySelectorAll('button')].find((item) => item.getAttribute('onclick') === 'runDatabaseBackup()');
  if (button) { button.disabled = true; button.dataset.oldText = button.textContent; button.textContent = 'Backing up…'; }
  try {
    const result = await api('/api/admin/backup', { method: 'POST', body: '{}' });
    showToast(`Private backup saved: ${result.path}. Content is preserved; no records were deleted.`, 'success', 6000);
  } catch (error) {
    showToast(error.message || 'Backup could not be completed. Check the private Supabase Storage bucket.', 'error', 6000);
  } finally {
    if (button) { button.disabled = false; button.textContent = button.dataset.oldText || 'Create backup'; }
  }
}

// Doctor management
function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');
  const infoEl = document.getElementById('pageInfo');
  if (!tbody) return;
  const start = (userPage - 1) * PAGE_SIZE;
  const page = filteredUsers.slice(start, start + PAGE_SIZE);
  const total = filteredUsers.length;
  const pages = Math.ceil(total / PAGE_SIZE);
  if (infoEl) infoEl.textContent = total ? `${start + 1}–${Math.min(start + PAGE_SIZE, total)} of ${total}` : '0 doctors';
  tbody.innerHTML = page.map((user) => `<tr>
    <td><div class="cell-name"><div class="cell-avatar">${escapeHTML(getInitials(String(user.name || 'Doctor')))}</div><div><div class="cell-name-text">${escapeHTML(user.name || '—')}</div><div class="cell-name-sub">${escapeHTML(user.email || '')}</div><div class="cell-name-sub">${escapeHTML(user.phone || '')}</div><div class="cell-name-sub">${user.password_set_at ? 'Password enabled' : 'Password not set'}${user.phone_verified ? ' · Mobile verified' : ' · Mobile not verified'}${user.welcome_email_opt_in ? ` · Welcome email ${escapeHTML(user.welcome_email_status || 'opted in')}` : ''}</div></div></div></td>
    <td>${escapeHTML(user.degree || '')}${user.degree && user.specialization ? '<br>' : ''}${escapeHTML(user.specialization || '—')}</td>
    <td>${escapeHTML([user.city, user.state].filter(Boolean).join(', ') || '—')}<div class="cell-name-sub">${escapeHTML(user.hospital || '')}</div></td>
    <td><span class="badge ${user.status === 'active' ? 'badge-active' : 'badge-muted'}">${user.status === 'active' ? 'Active' : 'Inactive'}</span></td>
    <td>${numberLabel(user.score)}%</td><td style="color:var(--text-muted);font-size:.8rem">${dateLabel(user.lastLogin || user.last_login)}</td>
    <td><div class="cell-action" style="gap:8px;flex-wrap:wrap">${!user.password_set_at && user.status === 'active' ? `<button class="btn btn-ghost" type="button" style="font-size:.72rem;padding:5px 7px" onclick="sendDoctorSetupInvite('${String(user.id).replace(/[^a-zA-Z0-9_-]/g, '')}')" title="Send a fresh password setup link">Send setup link</button>` : ''}<label class="toggle" aria-label="Toggle access for ${escapeHTML(user.name || 'doctor')}"><input type="checkbox" ${user.status === 'active' ? 'checked' : ''} onchange="toggleUser('${String(user.id).replace(/[^a-zA-Z0-9_-]/g, '')}', this.checked)"><div class="toggle-slider"></div></label></div></td>
  </tr>`).join('') || '<tr><td colspan="7" class="analytics-empty-cell">No doctors found. Use Invite Doctor to add a registered account.</td></tr>';
  renderPagination(pages);
}

function renderPagination(pages) {
  const element = document.getElementById('paginationBtns');
  if (!element) return;
  if (!pages) { element.innerHTML = ''; return; }
  let html = `<button class="page-btn" onclick="changePage(${userPage - 1})" ${userPage === 1 ? 'disabled' : ''}>←</button>`;
  for (let index = 1; index <= Math.min(pages, 5); index++) html += `<button class="page-btn ${index === userPage ? 'active' : ''}" onclick="changePage(${index})">${index}</button>`;
  html += `<button class="page-btn" onclick="changePage(${userPage + 1})" ${userPage >= pages ? 'disabled' : ''}>→</button>`;
  element.innerHTML = html;
}
function changePage(page) {
  const pages = Math.ceil(filteredUsers.length / PAGE_SIZE);
  if (page < 1 || page > pages) return;
  userPage = page;
  renderUsersTable();
}

async function toggleUser(id, active) {
  try {
    await api('/api/admin/doctors-status', { method: 'PATCH', body: JSON.stringify({ id, status: active ? 'active' : 'inactive' }) });
    const user = DB.users.find((item) => item.id === id);
    if (user) user.status = active ? 'active' : 'inactive';
    syncUsers();
    showToast(`${user?.name || 'Doctor'} ${active ? 'activated' : 'deactivated'}.`, active ? 'success' : 'info');
    renderUsersTable();
  } catch (error) {
    showToast(error.message || 'Unable to update doctor access.', 'error');
    renderUsersTable();
  }
}

function renderModulesGrid() {
  const element = document.getElementById('modulesAdminGrid');
  if (!element) return;
  element.innerHTML = (DB.modules || []).map((module) => {
    const opens = (DB.events || []).filter((event) => String(event.module_id || event.content_id || '') === String(module.id) && ['module_open', 'content_click', 'article_open'].includes(event.event_name)).length;
    const completions = (DB.events || []).filter((event) => String(event.module_id || '') === String(module.id) && event.event_name === 'article_complete').length;
    const rate = opens ? `${Math.round(completions / opens * 100)}%` : '—';
    const file = (module.presentations || [])[0];
    const moduleId = String(module.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const fileInfo = file ? `<div class="analytics-file-row"><span>Current PDF: <strong>${escapeHTML(file.filename)}</strong></span><a class="btn btn-ghost btn-sm" href="/api/module/${encodeURIComponent(file.id)}" target="_blank" rel="noopener">Open</a></div>` : '<div class="analytics-empty">No PDF uploaded yet.</div>';
    const bank = module.quizBank && Array.isArray(module.quizBank.questions) ? module.quizBank : null;
    const bankText = bank ? JSON.stringify({ title: bank.title || `${module.title} Assessment`, passingScore: bank.passingScore ?? 70, duration: 15, questions: bank.questions }, null, 2) : JSON.stringify({ title: `${module.title} Assessment`, passingScore: 70, duration: 15, questions: [] }, null, 2);
    return `<div class="card" style="padding:0;overflow:hidden"><div style="padding:var(--space-lg);border-bottom:1px solid var(--color-border-light);display:flex;align-items:center;gap:var(--space-sm)"><span style="font-size:1.4rem">${escapeHTML(module.icon || '📚')}</span><div style="flex:1;min-width:0"><div style="font-weight:600;font-size:.87rem;color:var(--text-primary)">${escapeHTML(module.title || 'Untitled module')}</div><div style="font-size:.72rem;color:var(--text-muted);margin-top:1px">${escapeHTML(module.type || module.contents?.[0]?.type || 'module')} · ${numberLabel(module.duration)} min</div></div><span class="badge ${module.status === 'active' ? 'badge-active' : 'badge-coming'}">${module.status === 'active' ? 'Published' : escapeHTML(module.status || 'Unavailable')}</span></div><div style="padding:var(--space-md) var(--space-lg);display:flex;gap:var(--space-xl)"><div><div style="font-size:1.1rem;font-weight:700;color:var(--text-primary)">${numberLabel(opens)}</div><div style="font-size:.7rem;color:var(--text-muted)">Recorded opens</div></div><div><div style="font-size:1.1rem;font-weight:700;color:var(--text-primary)">${rate}</div><div style="font-size:.7rem;color:var(--text-muted)">Observed completion / opens</div></div></div><div style="padding:0 var(--space-lg) var(--space-lg)">${fileInfo}<label class="btn btn-primary" for="module-presentation-${moduleId}" style="display:inline-flex;margin-top:12px;cursor:pointer">Upload / replace PDF<input id="module-presentation-${moduleId}" type="file" accept=".pdf,application/pdf" hidden onchange="uploadModulePresentation('${moduleId}', this)"></label><div id="module-upload-status-${moduleId}" class="field-help" aria-live="polite"></div><details style="margin-top:18px"><summary style="cursor:pointer;font-weight:650;color:var(--text-primary)">Manage assessment questions and answers${bank ? ` · ${numberLabel(bank.questions.length)} loaded` : ' · not added yet'}</summary><p class="field-help">Add exactly 5 questions from the approved module content. The correct answer is the zero-based option index (first option = 0). Saving publishes this question bank to Supabase.</p><textarea id="module-quiz-json-${moduleId}" rows="11" spellcheck="false" style="width:100%;min-width:0;box-sizing:border-box;font:12px/1.5 ui-monospace,monospace;border:1px solid var(--color-border);border-radius:8px;padding:10px;margin-top:8px">${escapeHTML(bankText)}</textarea><button type="button" class="btn btn-outline" style="margin-top:8px" onclick="saveModuleQuiz('${moduleId}')">Save assessment bank</button><div id="module-quiz-status-${moduleId}" class="field-help" aria-live="polite"></div></details></div></div>`;
  }).join('') || '<div class="analytics-empty">No module data loaded from the server.</div>';
}

async function saveModuleQuiz(moduleId) {
  const textarea = document.getElementById(`module-quiz-json-${moduleId}`);
  const status = document.getElementById(`module-quiz-status-${moduleId}`);
  const button = textarea?.parentElement?.querySelector('button');
  const say = (message) => { if (status) status.textContent = message; };
  if (!textarea) return;
  let parsed;
  try { parsed = JSON.parse(textarea.value); }
  catch { say('This is not valid JSON. Check commas, quotation marks and brackets.'); return; }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.questions)) { say('The JSON must contain a questions array.'); return; }
  if (parsed.questions.length !== 5) { say('Each module assessment must contain exactly 5 questions.'); showToast('Please add exactly 5 questions before saving.', 'error', 4500); return; }
  if (button) { button.disabled = true; button.textContent = 'Saving…'; }
  say('Saving question bank to Supabase…');
  try {
    const result = await api('/api/admin/module-quiz', { method: 'POST', body: JSON.stringify({ moduleId, title: parsed.title, passingScore: parsed.passingScore, duration: parsed.duration, questions: parsed.questions }) });
    await refreshServerData(); syncUsers(); renderModulesGrid(); renderOverview();
    showToast(result.message || 'Assessment bank saved.', 'success', 5000);
    const updated = document.getElementById(`module-quiz-status-${moduleId}`);
    if (updated) updated.textContent = `Saved to Supabase: ${result.questionCount} questions. Doctors can now open the assessment.`;
  } catch (error) {
    say(error.message || 'Unable to save the assessment bank.');
    showToast(error.message || 'Could not save the assessment bank.', 'error', 6000);
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Save assessment bank'; }
  }
}
async function uploadModulePresentation(moduleId, input) {
  const file = input?.files?.[0];
  if (!file) return;
  const status = document.getElementById(`module-upload-status-${moduleId}`);
  const say = (message) => { if (status) status.textContent = message; };
  if (file.size > 100 * 1024 * 1024) { say('File is larger than 100 MB.'); showToast('Choose a file smaller than 100 MB.', 'error'); input.value = ''; return; }
  const extension = file.name.includes('.') ? `.${file.name.split('.').pop().toLowerCase()}` : '';
  if (extension !== '.pdf' || (file.type && file.type !== 'application/pdf')) { say('Please choose a PDF file (.pdf) only.'); showToast('Only PDF files can be published to modules.', 'error', 4500); input.value = ''; return; }
  say('Preparing secure upload…');
  try {
    const signed = await api('/api/admin/module-upload-url', { method: 'POST', body: JSON.stringify({ moduleId, filename: file.name, contentType: 'application/pdf', size: file.size }) });
    say('Uploading to private Supabase Storage…');
    const uploadResponse = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false' }, body: file, cache: 'no-store' });
    if (!uploadResponse.ok) throw new Error(`Supabase Storage upload failed (${uploadResponse.status}). Confirm the private modules bucket and Storage CORS settings.`);
    say('Publishing to doctors…');
    const published = await api('/api/admin/module-publish', { method: 'POST', body: JSON.stringify({ moduleId, storagePath: signed.storagePath, publicId: signed.publicId, filename: signed.filename, contentType: 'application/pdf', size: signed.size }) });
    await refreshServerData(); syncUsers(); renderModulesGrid(); renderOverview();
    showToast(published.message || 'Module presentation published.', 'success', 6000);
    const newStatus = document.getElementById(`module-upload-status-${moduleId}`);
    if (newStatus) newStatus.textContent = 'PDF published successfully. Doctors can now read it inside MedNeo.';
  } catch (error) {
    say(error.message || 'Upload failed.');
    showToast(error.message || 'Could not publish this module presentation.', 'error', 7000);
  } finally { if (input) input.value = ''; }
}

function renderRegistrationArchive() {
  const body = document.getElementById('registrationArchiveTableBody');
  if (!body) return;
  const rows = DB.registrationAudit || [];
  body.innerHTML = rows.map((row) => `<tr><td>${dateLabel(row.registered_at || row.captured_at)}</td><td>${escapeHTML(row.name || '—')}</td><td>${escapeHTML(row.email || '—')}</td><td>${escapeHTML(row.phone || '—')}</td><td>${escapeHTML(row.degree || '—')}</td><td>${escapeHTML([row.city, row.state].filter(Boolean).join(', ') || '—')}</td><td><span class="badge badge-active">Archived</span></td></tr>`).join('') || '<tr><td colspan="7" class="analytics-empty-cell">Registration history will appear here after the additive migration is applied.</td></tr>';
}

function renderLogs() {
  const tbody = document.getElementById('logsTableBody');
  if (!tbody) return;
  const logs = DB.logs || [];
  const typeClass = { 'Login': 'log-login', 'OTP Login': 'log-login', 'Logout': 'log-logout', 'Module View': 'log-view', 'Article Read': 'log-view', 'Quiz Attempt': 'log-quiz', 'Quiz Complete': 'log-complete', 'Module Complete': 'log-complete', 'Download': 'log-download' };
  tbody.innerHTML = logs.slice(0, 500).map((log) => `<tr><td style="font-size:.78rem;color:var(--text-muted)">${dateLabel(log.time)}</td><td>${escapeHTML(log.userName || userById(log.user)?.name || log.user || 'System')}</td><td><span class="log-badge ${typeClass[log.event] || ''}">${escapeHTML(log.event || 'Event')}</span></td><td style="color:var(--text-muted)">${escapeHTML(log.module || '—')}</td><td style="color:var(--text-muted);font-size:.8rem">${escapeHTML(log.device || '—')}</td></tr>`).join('') || '<tr><td colspan="5" class="analytics-empty-cell">No activity log records yet.</td></tr>';
}

function openInviteModal() { openModal('inviteModal'); }
async function sendDoctorSetupInvite(doctorId) {
  const safeId = String(doctorId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) { showToast('Choose a valid doctor record.', 'error'); return; }
  try {
    const result = await api('/api/admin/invite', { method: 'POST', body: JSON.stringify({ doctorId: safeId }) });
    if (result.setupUrl) window.prompt('Local development password setup link (copy it now):', result.setupUrl);
    showToast(result.passwordSetupRequired ? (result.emailStatus === 'sent' ? 'A single-use password setup link was emailed. It expires in 24 hours.' : 'Password setup link is ready. Configure email delivery for production.') : 'This doctor can sign in using their email and password.', 'success', 6000);
    await refreshServerData(); syncUsers(); renderUsersTable();
  } catch (error) {
    showToast(error.message || 'Unable to send the invitation. Check email provider configuration.', 'error', 6000);
  }
}

async function submitInvite() {
  const value = (id) => String(document.getElementById(id)?.value || '').trim();
  const name = value('inviteName');
  const email = value('inviteEmail');
  const phone = value('invitePhone');
  const degree = value('inviteDegree');
  const specialization = value('inviteSpec');
  const hospital = value('inviteHospital');
  const registrationNumber = value('inviteRegistrationNumber');
  const city = value('inviteCity');
  const state = value('inviteState');
  if (!name || !email || !phone) { showToast('Name, email and mobile number are required.', 'error'); return; }
  const button = document.querySelector('#inviteModal .btn.btn-primary');
  if (button) { button.disabled = true; button.dataset.originalText = button.textContent; button.textContent = 'Saving…'; }
  try {
    const created = await api('/api/admin/doctors', { method: 'POST', body: JSON.stringify({ name, email, phone, degree, specialization, hospital, registrationNumber, city, state }) });
    if (!Array.isArray(DB.users)) DB.users = [];
    DB.users.unshift(created.user);
    let invitationMessage = '';
    try {
      const inviteResult = await api('/api/admin/invite', { method: 'POST', body: JSON.stringify({ doctorId: created.user.id }) });
      if (inviteResult.setupUrl) window.prompt('Local development password setup link (copy it now):', inviteResult.setupUrl);
      invitationMessage = inviteResult.passwordSetupRequired ? (inviteResult.emailStatus === 'sent' ? ' Password setup link emailed.' : ' Password setup link ready; email is not configured.') : ' Doctor can sign in with their existing password.';
    } catch (error) { invitationMessage = ` Profile is saved, but the email invite failed: ${error.message}. Use “Send setup link” in the doctor list to retry.`; }
    closeModal('inviteModal');
    showToast(`Doctor profile saved.${invitationMessage}`, 'success', 7000);
    ['inviteName','inviteEmail','invitePhone','inviteDegree','inviteSpec','inviteHospital','inviteRegistrationNumber','inviteCity','inviteState'].forEach((id) => { const field = document.getElementById(id); if (field) field.value = ''; });
    syncUsers();
    renderOverview(); renderUsersTable(); renderAnalytics();
  } catch (error) {
    showToast(error.message || 'Unable to save doctor.', 'error', 5000);
  } finally {
    if (button) { button.disabled = false; button.textContent = button.dataset.originalText || 'Send Invitation'; }
  }
}
