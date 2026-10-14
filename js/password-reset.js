document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const token = String(params.get('token') || '');
  const requestForm = document.getElementById('requestResetForm');
  const setForm = document.getElementById('setNewPasswordForm');
  const title = document.getElementById('resetTitle');
  const intro = document.getElementById('resetIntro');
  const message = document.getElementById('resetMessage');
  const showMessage = (text, isError = false) => {
    message.textContent = text; message.hidden = !text; message.classList.toggle('error', Boolean(isError));
  };
  // Remove the one-time secret from visible browser history as soon as it is read.
  if (token) {
    history.replaceState({}, document.title, window.location.pathname);
    requestForm.hidden = true; setForm.hidden = false;
    title.textContent = 'Choose a new password';
    intro.textContent = 'Choose a strong password for your MedNeo account. This reset link can only be used once.';
  }
  requestForm.addEventListener('submit', async (event) => {
    event.preventDefault(); showMessage('');
    const button = document.getElementById('requestResetBtn'); button.disabled = true; button.textContent = 'Sending…';
    try {
      const result = await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: document.getElementById('resetEmail').value.trim() }) });
      showMessage(result.message || 'If an active account uses that email address, a reset link will be sent shortly.');
      if (result.developmentResetUrl) {
        const link = document.createElement('a'); link.href = result.developmentResetUrl; link.textContent = 'Open local development reset link'; link.style.display = 'block'; link.style.marginTop = '8px'; link.style.color = '#b8161b'; message.appendChild(document.createElement('br')); message.appendChild(link);
      }
    } catch (error) { showMessage(error.message || 'Unable to request a reset link right now.', true); }
    finally { button.disabled = false; button.textContent = 'Send reset link'; }
  });
  setForm.addEventListener('submit', async (event) => {
    event.preventDefault(); showMessage('');
    const password = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;
    if (password !== confirmPassword) { showMessage('Passwords do not match.', true); return; }
    const button = document.getElementById('saveNewPasswordBtn'); button.disabled = true; button.textContent = 'Saving securely…';
    try {
      const result = await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password, confirmPassword }) });
      showMessage(result.message || 'Password updated successfully.');
      setForm.hidden = true;
      const link = document.createElement('a'); link.href = 'index.html'; link.textContent = 'Return to sign in'; link.className = 'reset-back'; link.style.display = 'block'; message.appendChild(document.createElement('br')); message.appendChild(link);
    } catch (error) { showMessage(error.message || 'Unable to reset your password.', true); }
    finally { button.disabled = false; button.textContent = 'Save new password'; }
  });
});
