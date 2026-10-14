/* MedNeo authentication: administrators and doctors sign in with email + password. */
document.addEventListener('DOMContentLoaded', async () => {
  const session = await getSession();
  if (session) { redirect(session.role); return; }

  document.querySelectorAll('[data-login-role]').forEach((button) => {
    button.addEventListener('click', () => setLoginRole(button.dataset.loginRole));
  });
  document.getElementById('loginForm')?.addEventListener('submit', handleAdminLogin);
  document.getElementById('doctorPasswordForm')?.addEventListener('submit', handleDoctorPasswordLogin);
  document.getElementById('togglePass')?.addEventListener('click', () => toggleAdminPassword());
  document.getElementById('loginForm')?.addEventListener('input', clearAuthError);
  document.getElementById('doctorPasswordForm')?.addEventListener('input', clearAuthError);
  setLoginRole('doctor');
});

function setLoginRole(role) {
  const isDoctor = role !== 'admin';
  const doctor = document.getElementById('doctorLoginPanel');
  const admin = document.getElementById('adminLoginPanel');
  if (doctor) doctor.hidden = !isDoctor;
  if (admin) admin.hidden = isDoctor;
  document.querySelectorAll('[data-login-role]').forEach((button) => {
    const active = button.dataset.loginRole === (isDoctor ? 'doctor' : 'admin');
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  clearAuthError();
}

async function handleAdminLogin(event) {
  event.preventDefault();
  const email = document.getElementById('email')?.value.trim().toLowerCase() || '';
  const password = document.getElementById('password')?.value || '';
  const button = document.getElementById('loginBtn');
  if (!email || !password) { showError('Enter your administrator email and password.'); return; }
  clearAuthError(); setBusy(button, true, 'Signing in…');
  try {
    const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password, role: 'admin' }) });
    setSession(result.user); redirect('admin');
  } catch (error) { showError(error.message || 'Unable to sign in as administrator.'); }
  finally { setBusy(button, false, 'Sign in as admin'); }
}

async function handleDoctorPasswordLogin(event) {
  event.preventDefault();
  const email = document.getElementById('doctorLoginEmail')?.value.trim().toLowerCase() || '';
  const password = document.getElementById('doctorLoginPassword')?.value || '';
  const button = document.getElementById('doctorPasswordLoginBtn');
  if (!email || !password) { showError('Enter your email and password.'); return; }
  clearAuthError(); setBusy(button, true, 'Signing in…');
  try {
    const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password, role: 'doctor' }) });
    setSession(result.user); redirect('doctor');
  } catch (error) { showError(error.message || 'Unable to sign in. Check your email and password.'); }
  finally { setBusy(button, false, 'Sign in securely'); }
}

function toggleAdminPassword() {
  const input = document.getElementById('password');
  const button = document.getElementById('togglePass');
  if (!input || !button) return;
  const show = input.type === 'password'; input.type = show ? 'text' : 'password';
  button.textContent = show ? 'Hide' : 'Show'; button.setAttribute('aria-label', `${show ? 'Hide' : 'Show'} password`);
}
function setBusy(button, busy, label) {
  if (!button) return; button.disabled = busy;
  const target = button.querySelector('.btn-text'); if (target) target.textContent = label; else button.textContent = label;
}
function clearAuthError() { const el = document.getElementById('loginError'); if (el) { el.textContent = ''; el.classList.remove('show'); } }
function showError(message) { const el = document.getElementById('loginError'); if (el) { el.textContent = message; el.classList.add('show'); } }
function redirect(role) { window.location.href = role === 'admin' ? 'admin-dashboard.html' : 'doctor-dashboard.html'; }
