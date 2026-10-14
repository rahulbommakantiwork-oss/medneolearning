function credentials() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const username = process.env.TWILIO_API_KEY_SID || accountSid;
  const password = process.env.TWILIO_API_KEY_SECRET || process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!serviceSid || !username || !password) {
    const error = new Error('Phone OTP is not configured. Add the Twilio Verify environment variables.');
    error.code = 'OTP_NOT_CONFIGURED';
    throw error;
  }
  return { username, password, serviceSid };
}

async function twilioPost(resource, params) {
  const { username, password, serviceSid } = credentials();
  const body = new URLSearchParams(params);
  const response = await fetch(`https://verify.twilio.com/v2/Services/${serviceSid}/${resource}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body,
    signal: AbortSignal.timeout(12000)
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
  if (!response.ok) {
    const error = new Error('The OTP service could not complete the request. Please try again shortly.');
    error.status = response.status;
    error.providerCode = data.code;
    throw error;
  }
  return data;
}

export async function sendPhoneOtp(to) {
  return twilioPost('Verifications', { To: to, Channel: 'sms' });
}

export async function verifyPhoneOtp(to, code) {
  return twilioPost('VerificationCheck', { To: to, Code: code });
}
