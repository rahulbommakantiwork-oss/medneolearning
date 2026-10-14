/* Accessible password-only doctor registration. Passwords are sent over HTTPS and hashed server-side. */
let registrationSoundEnabled = false;
let registrationFontSize = 16;

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('doctorRegisterForm')?.addEventListener('submit', submitRegistration);
  document.querySelectorAll('[data-password-toggle]').forEach((button) => {
    button.addEventListener('click', () => togglePassword(button.dataset.passwordToggle, button));
  });
  document.querySelectorAll('[data-show-register]').forEach((button) => button.addEventListener('click', showRegistrationPanel));
  document.querySelectorAll('[data-show-login]').forEach((button) => button.addEventListener('click', () => showLoginPanel(button.dataset.showLogin || 'doctor')));

  document.getElementById('regDegree')?.addEventListener('change', updateOtherDegree);
  document.getElementById('regState')?.addEventListener('change', updateOtherState);
  document.getElementById('regPassword')?.addEventListener('input', updatePasswordFeedback);
  document.getElementById('regConfirmPassword')?.addEventListener('input', updatePasswordFeedback);
  document.getElementById('doctorRegisterForm')?.addEventListener('input', clearRegistrationError);
  document.getElementById('fontSmallerBtn')?.addEventListener('click', () => setFontSize(registrationFontSize - 1));
  document.getElementById('fontLargerBtn')?.addEventListener('click', () => setFontSize(registrationFontSize + 1));
  document.getElementById('contrastToggleBtn')?.addEventListener('click', toggleContrast);
  document.getElementById('soundToggleBtn')?.addEventListener('click', toggleSound);

  // Legacy landing pages switch among Sign In, Forgot Password and Create Account.
  const tabButtons = [...document.querySelectorAll('.auth-tabs .tab-btn')];
  if (tabButtons.length) {
    tabButtons.forEach((button) => button.addEventListener('click', () => {
      const tab = button.dataset.tab;
      tabButtons.forEach((item) => item.classList.toggle('active', item === button));
      document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === tab));
      if (tab === 'register') document.getElementById('regName')?.focus();
    }));
  }
});

function getApi() {
  if (typeof api === 'function') return api;
  return async (url, options = {}) => {
    const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const text = await response.text();
    let result = {};
    try { result = text ? JSON.parse(text) : {}; } catch { result = { error: text || 'Request failed.' }; }
    if (!response.ok) { const error = new Error(result.error || `Request failed (${response.status})`); error.status = response.status; throw error; }
    return result;
  };
}

async function submitRegistration(event) {
  event.preventDefault();
  const form = document.getElementById('doctorRegisterForm');
  if (!form?.checkValidity()) { form?.reportValidity(); return; }

  const password = value('regPassword');
  const confirmation = value('regConfirmPassword');
  if (password.length < 10 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    showRegistrationError('Use at least 10 characters, including at least one letter and one number.');
    document.getElementById('regPassword')?.focus();
    return;
  }
  if (password !== confirmation) {
    showRegistrationError('The passwords do not match. Check both fields and try again.');
    document.getElementById('regConfirmPassword')?.focus();
    return;
  }
  const selectedDegree = value('regDegree');
  const degree = selectedDegree === 'Other' ? value('regDegreeOther').trim() : selectedDegree;
  if (!degree) { showRegistrationError('Enter your degree to continue.'); document.getElementById('regDegreeOther')?.focus(); return; }
  const selectedState = value('regState');
  const state = selectedState === 'Other' ? value('regStateOther').trim() : selectedState;
  const city = value('regCity').trim();
  if (!city || !state) { showRegistrationError('Enter your city and state to continue.'); (city ? document.getElementById('regState') : document.getElementById('regCity'))?.focus(); return; }
  if (!document.getElementById('regConsent')?.checked) { showRegistrationError('Please confirm your details and consent to learning activity tracking.'); return; }

  const button = document.getElementById('registerStartBtn');
  setButtonBusy(button, true, 'Creating your account…');
  clearRegistrationError();
  try {
    const response = await getApi()('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: value('regName').trim(),
        email: value('regEmail').trim().toLowerCase(),
        phone: value('regPhone').trim(),
        degree,
        city,
        state,
        password,
        confirmPassword: confirmation,
        sendWelcomeEmail: Boolean(document.getElementById('regWelcomeEmail')?.checked),
        consent: true
      })
    });
    if (typeof setSession === 'function') setSession(response.user);
    speakSoftFeedback('success');
    showToastSafe(response.message || 'Your account is ready.', 'success');
    window.location.assign('doctor-dashboard.html');
  } catch (error) {
    const message = error.status === 405
      ? 'The account service is not active on this hosting setup. Deploy the complete project with its /api functions enabled (the Vercel project root must contain index.html, api/, package.json and vercel.json). Static-only hosting cannot create accounts.'
      : error.message || 'Unable to create your account. Please try again.';
    showRegistrationError(message);
    if (error.status === 409) document.getElementById('regEmail')?.focus();
  } finally {
    setButtonBusy(button, false, 'Create account securely');
  }
}

function updateOtherState() {
  const selected = value('regState');
  const wrapper = document.getElementById('regStateOtherWrap');
  const other = document.getElementById('regStateOther');
  if (!wrapper || !other) return;
  const show = selected === 'Other';
  wrapper.hidden = !show; other.required = show;
  if (!show) other.value = '';
}
function updateOtherDegree() {
  const selected = value('regDegree');
  const wrapper = document.getElementById('regDegreeOtherWrap');
  const other = document.getElementById('regDegreeOther');
  if (!wrapper || !other) return;
  const show = selected === 'Other';
  wrapper.hidden = !show; other.required = show;
  if (!show) other.value = '';
}
function updatePasswordFeedback() {
  const password = value('regPassword');
  const confirm = value('regConfirmPassword');
  const bar = document.getElementById('passwordStrengthBar');
  const status = document.getElementById('passwordStrengthText');
  const match = document.getElementById('passwordMatchText');
  let score = 0;
  if (password.length >= 10) score++;
  if (/[A-Za-z]/.test(password) && /\d/.test(password)) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (bar) { bar.style.width = `${score * 25}%`; bar.dataset.strength = score <= 1 ? 'weak' : score <= 2 ? 'medium' : 'strong'; }
  if (status) status.textContent = !password ? 'Use 10+ characters with at least one letter and one number.' : score <= 1 ? 'Password strength: getting started' : score <= 2 ? 'Password strength: fair' : 'Password strength: strong';
  if (match) {
    if (!confirm) { match.textContent = 'Enter the same password twice.'; match.dataset.match = ''; }
    else if (password === confirm) { match.textContent = 'Passwords match.'; match.dataset.match = 'yes'; }
    else { match.textContent = 'Passwords do not match yet.'; match.dataset.match = 'no'; }
  }
}
function togglePassword(id, button) {
  const input = document.getElementById(id);
  if (!input || !button) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  button.textContent = show ? 'Hide' : 'Show';
  button.setAttribute('aria-label', `${show ? 'Hide' : 'Show'} password`);
}
function showRegistrationPanel() {
  const panel = document.getElementById('doctorRegisterPanel');
  if (panel) {
    document.querySelector('.auth-form-wrap > .auth-form-heading')?.setAttribute('hidden', '');
    document.querySelector('.login-role-tabs')?.setAttribute('hidden', '');
    const error = document.getElementById('loginError'); if (error) error.hidden = true;
    const doctor = document.getElementById('doctorLoginPanel'); if (doctor) doctor.hidden = true;
    const admin = document.getElementById('adminLoginPanel'); if (admin) admin.hidden = true;
    panel.hidden = false;
    document.getElementById('regName')?.focus();
    return;
  }
  const tab = document.querySelector('.auth-tabs [data-tab="register"]');
  if (tab) tab.click();
}
function showLoginPanel(role) {
  const panel = document.getElementById('doctorRegisterPanel');
  if (panel) panel.hidden = true;
  document.querySelector('.auth-form-wrap > .auth-form-heading')?.removeAttribute('hidden');
  document.querySelector('.login-role-tabs')?.removeAttribute('hidden');
  const loginError = document.getElementById('loginError'); if (loginError) loginError.hidden = false;
  if (typeof setLoginRole === 'function') setLoginRole(role === 'admin' ? 'admin' : 'doctor');
  if (panel) document.getElementById(role === 'admin' ? 'email' : 'doctorLoginEmail')?.focus();
  else document.querySelector('.auth-tabs [data-tab="login"]')?.click();
}
function setFontSize(size) { registrationFontSize = Math.min(20, Math.max(14, size)); document.documentElement.style.fontSize = `${registrationFontSize}px`; }
function toggleContrast() {
  const active = document.body.classList.toggle('accessibility-high-contrast');
  const button = document.getElementById('contrastToggleBtn');
  if (button) { button.setAttribute('aria-pressed', String(active)); button.textContent = active ? 'Standard contrast' : 'Contrast'; }
}
function toggleSound() {
  registrationSoundEnabled = !registrationSoundEnabled;
  const button = document.getElementById('soundToggleBtn');
  if (button) { button.setAttribute('aria-pressed', String(registrationSoundEnabled)); button.textContent = registrationSoundEnabled ? 'Sound on' : 'Sound off'; }
  if (registrationSoundEnabled) speakSoftFeedback('ready');
}
function speakSoftFeedback(kind) {
  if (!registrationSoundEnabled) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const notes = kind === 'success' ? [660, 880] : [440];
    let at = context.currentTime;
    notes.forEach((frequency) => {
      const oscillator = context.createOscillator(); const gain = context.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(0.035, at + 0.025); gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
      oscillator.connect(gain); gain.connect(context.destination); oscillator.start(at); oscillator.stop(at + 0.16); at += 0.12;
    });
    setTimeout(() => context.close().catch(() => {}), 550);
  } catch {}
}
function showRegistrationError(message) { const el = document.getElementById('registrationError'); if (el) { el.textContent = message; el.hidden = false; el.classList.add('show'); } }
function clearRegistrationError() { const el = document.getElementById('registrationError'); if (el) { el.textContent = ''; el.classList.remove('show'); el.hidden = false; } }
function setButtonBusy(button, busy, label) { if (!button) return; button.disabled = busy; const labelNode = button.querySelector('.btn-text'); if (labelNode) labelNode.textContent = label; else button.textContent = label; }
function value(id) { return document.getElementById(id)?.value ?? ''; }
function showToastSafe(message, type) { if (typeof showToast === 'function') showToast(message, type); }
