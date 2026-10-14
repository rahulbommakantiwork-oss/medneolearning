/* Authentication wiring for the two preserved legacy landing-page variants. */
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginForm')?.addEventListener('submit', legacyDoctorLogin);
  document.getElementById('forgotForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.getElementById('forgotStatus') || document.getElementById('loginError');
    const email = String(document.getElementById('resetEmail')?.value || '').trim();
    const button = event.currentTarget.querySelector('button[type=submit]');
    if (button) { button.disabled = true; button.dataset.oldText = button.textContent; button.textContent = 'Sending…'; }
    if (status) { status.textContent = ''; status.classList.remove('show'); }
    try {
      const result = await window.api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
      if (status) { status.textContent = result.message || 'If an active account matches, a reset link will be sent shortly.'; status.classList.add('show'); }
      if (result.developmentResetUrl && status) { const link = document.createElement('a'); link.href = result.developmentResetUrl; link.textContent = 'Open local reset link'; link.style.display = 'block'; status.appendChild(document.createElement('br')); status.appendChild(link); }
    } catch (error) { if (status) { status.textContent = error.message || 'Unable to request a reset link right now.'; status.classList.add('show'); } }
    finally { if (button) { button.disabled = false; button.textContent = button.dataset.oldText || 'Send Reset Link'; } }
  });
  document.getElementById('togglePass')?.addEventListener('click', () => {
    const input = document.getElementById('password');
    const button = document.getElementById('togglePass');
    if (!input || !button) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.textContent = show ? 'Hide' : 'Show';
    button.setAttribute('aria-label', `${show ? 'Hide' : 'Show'} password`);
  });
});
async function legacyDoctorLogin(event) {
  event.preventDefault();
  const email = String(document.getElementById('email')?.value || '').trim().toLowerCase();
  const password = String(document.getElementById('password')?.value || '');
  const errorNode = document.getElementById('loginError');
  const button = document.getElementById('loginBtn');
  if (!email || !password) { showLegacyError('Enter your email and password.'); return; }
  setLegacyBusy(button, true, 'Signing in…');
  showLegacyError('');
  try {
    const response = await window.api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password, role: 'doctor' }) });
    if (typeof setSession === 'function') setSession(response.user);
    window.location.assign('doctor-dashboard.html');
  } catch (error) {
    showLegacyError(error.message || 'Unable to sign in. Check your email and password.');
  } finally { setLegacyBusy(button, false, 'Sign In to MedNeo'); }
  function showLegacyError(message) {
    if (!errorNode) return;
    errorNode.textContent = message;
    errorNode.classList.toggle('show', Boolean(message));
    errorNode.hidden = false;
  }
}
function setLegacyBusy(button, busy, label) {
  if (!button) return;
  button.disabled = busy;
  const text = button.querySelector('.btn-text');
  if (text) text.textContent = label;
  else if (!busy) button.textContent = label;
}
