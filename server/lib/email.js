/* Optional transactional email via Resend. Passwords are never emailed. */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

export async function sendWelcomeEmail({ email, name, degree }) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const from = String(process.env.RESEND_FROM_EMAIL || '').trim();
  if (!apiKey || !from) return { status: 'not_configured' };

  const safeName = escapeHtml(name || 'Doctor');
  const safeDegree = escapeHtml(degree || '');
  const origin = String(process.env.APP_ORIGIN || '').trim().replace(/\/$/, '');
  const dashboardUrl = origin ? `${origin}/doctor-dashboard.html` : '';
  const html = `<!doctype html><html><body style="margin:0;padding:32px;background:#f7f7f8;font-family:Arial,sans-serif;color:#222"><div style="max-width:560px;margin:auto;background:#fff;padding:32px;border-radius:14px;border:1px solid #e8e8eb"><p style="color:#b8161b;font-weight:700;letter-spacing:.08em">MEDNEO · MEDICAL EDUCATION</p><h1 style="font-size:24px;line-height:1.3">Welcome, ${safeName}</h1><p>Your doctor account has been created successfully${safeDegree ? ` with degree ${safeDegree}` : ''}.</p><p>You can sign in using the email address and password you created during registration.</p>${dashboardUrl ? `<p><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#b8161b;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Open your dashboard</a></p>` : ''}<p style="font-size:12px;color:#666">For your security, MedNeo will never email your password. If you did not create this account, contact the programme administrator.</p></div></body></html>`;
  const text = `Welcome, ${name || 'Doctor'}! Your MedNeo doctor account has been created successfully. For your security, we will never email your password. If you did not create this account, contact the programme administrator.${dashboardUrl ? ` Sign in: ${dashboardUrl}` : ''}`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [email], subject: 'Your MedNeo account is ready', html, text }),
      signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) return { status: 'failed' };
    return { status: 'sent' };
  } catch {
    return { status: 'failed' };
  }
}


async function sendTransactionalEmail({ email, subject, html, text }) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const from = String(process.env.RESEND_FROM_EMAIL || '').trim();
  if (!apiKey || !from) return { status: 'not_configured' };
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [email], subject, html, text }),
      signal: AbortSignal.timeout(8000)
    });
    return response.ok ? { status: 'sent' } : { status: 'failed' };
  } catch { return { status: 'failed' }; }
}

export async function sendPasswordResetEmail({ email, name, resetUrl }) {
  const safeName = escapeHtml(name || 'Doctor');
  const safeUrl = escapeHtml(resetUrl);
  return sendTransactionalEmail({
    email,
    subject: 'Reset your MedNeo password',
    html: `<!doctype html><html><body style="margin:0;padding:32px;background:#f7f7f8;font-family:Arial,sans-serif;color:#222"><div style="max-width:560px;margin:auto;background:#fff;padding:32px;border-radius:14px;border:1px solid #e8e8eb"><p style="color:#b8161b;font-weight:700;letter-spacing:.08em">MEDNEO · MEDICAL EDUCATION</p><h1 style="font-size:24px;line-height:1.3">Reset your password</h1><p>Hello ${safeName}, we received a request to reset the password for your MedNeo account.</p><p><a href="${safeUrl}" style="display:inline-block;background:#b8161b;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Choose a new password</a></p><p>This single-use link expires in 30 minutes. If you did not request a reset, you can ignore this email.</p><p style="font-size:12px;color:#666">For security, MedNeo never asks you to email your password.</p></div></body></html>`,
    text: `Hello ${name || 'Doctor'}, reset your MedNeo password using this single-use link (expires in 30 minutes): ${resetUrl}. If you did not request a reset, ignore this email.`
  });
}

export async function sendPasswordSetupEmail({ email, name, setupUrl }) {
  const safeName = escapeHtml(name || 'Doctor');
  const safeUrl = escapeHtml(setupUrl);
  return sendTransactionalEmail({
    email,
    subject: 'Set your MedNeo account password',
    html: `<!doctype html><html><body style="margin:0;padding:32px;background:#f7f7f8;font-family:Arial,sans-serif;color:#222"><div style="max-width:560px;margin:auto;background:#fff;padding:32px;border-radius:14px;border:1px solid #e8e8eb"><p style="color:#b8161b;font-weight:700;letter-spacing:.08em">MEDNEO · MEDICAL EDUCATION</p><h1 style="font-size:24px;line-height:1.3">Welcome, ${safeName}</h1><p>Your MedNeo doctor account is ready. Choose your own password to activate sign-in.</p><p><a href="${safeUrl}" style="display:inline-block;background:#b8161b;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Set my password</a></p><p>This single-use link expires in 24 hours.</p><p style="font-size:12px;color:#666">For your security, the link can be used once and your password is never emailed.</p></div></body></html>`,
    text: `Welcome, ${name || 'Doctor'}. Set your MedNeo password using this single-use link (expires in 24 hours): ${setupUrl}.`
  });
}
