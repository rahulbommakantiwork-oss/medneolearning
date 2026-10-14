/* ============================================================
   Alembic MedLearn — Utils
   ============================================================ */

// ============ SERVER SESSION / DATA ============
let GML_SESSION = null;
let GML_DATA_READY = null;

async function api(path, options = {}) {
  const opts = { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } };
  const res = await fetch(path, opts);
  const text = await res.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text || `HTTP ${res.status}` }; }
  if (!res.ok) {
    const err = new Error(body.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body;
}

async function refreshServerData() {
  // Force a fresh server read after admin changes. Never cache user or module data in localStorage.
  GML_DATA_READY = null;
  return loadServerData();
}

async function loadServerData() {
  if (GML_DATA_READY) return GML_DATA_READY;
  GML_DATA_READY = api('/api/data').then(data => {
    Object.assign(DB, data);
    window.ANALYTICS = window.ANALYTICS || {};
    if (data.analytics) Object.assign(window.ANALYTICS, data.analytics);
    return data;
  }).catch(err => { GML_DATA_READY = null; throw err; });
  return GML_DATA_READY;
}

async function getSession() {
  if (GML_SESSION) return GML_SESSION;
  try {
    const data = await api('/api/auth/me');
    GML_SESSION = data.user;
    return GML_SESSION;
  } catch { return null; }
}
function setSession(user) { GML_SESSION = user || null; } // server owns the actual session cookie
async function clearSession() {
  GML_SESSION = null;
  try { await api('/api/auth/logout', { method:'POST', body:'{}' }); } catch {}
}
async function authGuard(role) {
  const user = await getSession();
  if (!user) { window.location = 'index.html'; return null; }
  if (role && user.role !== role) { window.location = 'index.html'; return null; }
  await loadServerData();
  return user;
}

// ============ TOAST ============
function showToast(msg, type = 'info', duration = 3000) {
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type] || '•'}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

// ============ MODAL ============
function openModal(id)  { const m = document.getElementById(id); if (m) { m.classList.add('open'); document.body.style.overflow = 'hidden'; } }
function closeModal(id) { const m = document.getElementById(id); if (m) { m.classList.remove('open'); document.body.style.overflow = ''; } }

// Close modal on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
    document.body.style.overflow = '';
  }
});

// ============ NAV ============
function initNav(onSwitch) {
  document.querySelectorAll('.nav-item[data-section]').forEach(item => {
    item.addEventListener('click', () => {
      const section = item.dataset.section;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      const el = document.getElementById('sec-' + section);
      if (el) el.classList.add('active');
      if (onSwitch) onSwitch(section);
    });
  });
}

// ============ SIDEBAR TOGGLE ============
function initSidebarToggle() {
  const sidebar = document.querySelector('.sidebar');
  const mainArea = document.querySelector('.main-area');
  const header   = document.querySelector('.app-header');
  const toggleBtn = document.getElementById('sidebarToggle');
  if (!toggleBtn) return;

  toggleBtn.addEventListener('click', () => {
    sidebar?.classList.toggle('collapsed');
    mainArea?.classList.toggle('sidebar-collapsed');
    header?.classList.toggle('sidebar-collapsed');
  });
}

// ============ LOGOUT ============
function initLogout() {
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await clearSession();
    window.location = 'index.html';
  });
}

// ============ GREETING ============
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

// ============ INITIALS ============
function getInitials(name) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

// ============ FORMAT DATE ============
function formatDate() {
  return new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// ============ ANIMATE COUNTER ============
function animateCounter(el, target, duration = 1200) {
  if (!el) return;
  const start = 0;
  const startTime = performance.now();
  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(start + (target - start) * eased);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ============ POPULATE STATES ============
function populateStates(selectId) {
  const el = document.getElementById(selectId);
  if (!el || !DB?.stateCities) return;
  Object.keys(DB.stateCities).forEach(state => {
    const opt = document.createElement('option');
    opt.value = state;
    opt.textContent = state;
    el.appendChild(opt);
  });
}

function populateCities(stateId, cityId) {
  const state = document.getElementById(stateId)?.value;
  const cityEl = document.getElementById(cityId);
  if (!cityEl || !state || !DB?.stateCities[state]) return;
  cityEl.innerHTML = '<option value="">Select City</option>';
  DB.stateCities[state].forEach(city => {
    const opt = document.createElement('option');
    opt.value = city;
    opt.textContent = city;
    cityEl.appendChild(opt);
  });
}

// Server-backed analytics. The session identifier is memory-only and disappears when the page closes.
const GML_EVENT_SESSION_ID = (() => {
  try { return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `gml-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`; }
  catch { return `gml-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`; }
})();
async function trackEvent(eventName, details = {}) {
  const name = String(eventName || '').trim().toLowerCase();
  if (!name) return null;
  const body = {
    eventName: name,
    sessionId: GML_EVENT_SESSION_ID,
    route: window.location?.pathname || '',
    contentType: details.contentType || null,
    contentId: details.contentId || null,
    moduleId: details.moduleId || null,
    durationSeconds: details.durationSeconds || 0,
    payload: details.payload && typeof details.payload === 'object' ? details.payload : {}
  };
  try {
    return await api('/api/track', { method: 'POST', body: JSON.stringify(body) });
  } catch (error) {
    // Analytics failures must not break quiz navigation or reading. The server still logs failures.
    if (!window.__medneoAnalyticsWarned) {
      window.__medneoAnalyticsWarned = true;
      console.warn('[MedNeo analytics] Some activity could not be saved. Check the /api/track response and server logs.', error?.status || '', error?.message || '');
    }
    return null;
  }
}
window.trackEvent = trackEvent;
