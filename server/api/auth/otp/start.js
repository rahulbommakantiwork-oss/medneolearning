import crypto from 'node:crypto';
import { select, insert } from '../../_lib/db.js';
import { normalizePhone } from '../../_lib/phone.js';
import { sendPhoneOtp } from '../../_lib/twilio-verify.js';

function digest(value) {
  const secret = process.env.GML_SESSION_SECRET;
  if (!secret) throw new Error('Session configuration is missing');
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim().slice(0, 100);
}
function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });
  try {
    const phone = normalizePhone(req.body?.phone);
    if (!phone) return respond(res, 400, { error: 'Enter a valid phone number, including the country code if outside India.' });

    if (!(process.env.TWILIO_VERIFY_SERVICE_SID &&
      (process.env.TWILIO_API_KEY_SID && process.env.TWILIO_API_KEY_SECRET || process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN))) {
      return respond(res, 503, { error: 'Phone OTP is not configured yet. Ask the administrator to finish the SMS setup.' });
    }
    const phoneHash = digest(`phone:${phone}`);
    const ipHash = digest(`ip:${clientIp(req)}`);
    const hourAgo = encodeURIComponent(new Date(Date.now() - 60 * 60 * 1000).toISOString());
    const [phoneRequests, ipRequests] = await Promise.all([
      select('otp_send_events', `select=id,created_at&phone_hash=eq.${phoneHash}&created_at=gte.${hourAgo}&order=created_at.desc&limit=6`),
      select('otp_send_events', `select=id,created_at&ip_hash=eq.${ipHash}&created_at=gte.${hourAgo}&order=created_at.desc&limit=11`)
    ]);
    const lastSent = phoneRequests?.[0]?.created_at ? new Date(phoneRequests[0].created_at).getTime() : 0;
    if (lastSent && Date.now() - lastSent < 30 * 1000) {
      return respond(res, 429, { error: 'Please wait 30 seconds before requesting another code.', retryAfterSeconds: Math.ceil((30 * 1000 - (Date.now() - lastSent)) / 1000) });
    }
    if ((phoneRequests || []).length >= 5 || (ipRequests || []).length >= 10) {
      return respond(res, 429, { error: 'Too many OTP requests. Please try again in an hour.' });
    }

    // Count all valid requests, including unregistered numbers, to reduce account probing and abuse.
    await insert('otp_send_events', { phone_hash: phoneHash, ip_hash: ipHash });
    const candidates = await select('users', 'select=id,phone,role,status&role=eq.doctor&status=eq.active&phone=not.is.null&limit=5000');
    const user = (candidates || []).find((item) => normalizePhone(item.phone) === phone);
    if (user) await sendPhoneOtp(phone);
    // Return the same message for registered and unregistered numbers. Do not echo a masked phone
    // only for matching accounts, since that makes account enumeration easier.
    return respond(res, 200, { ok: true, message: 'If this number is registered, an OTP has been sent.' });
  } catch (error) {
    if (error.status === 429 || error.providerCode === 60203) {
      return respond(res, 429, { error: 'Too many verification requests. Please wait before trying again.' });
    }
    if (error.code === 'OTP_NOT_CONFIGURED') {
      return respond(res, 503, { error: 'Phone OTP is not configured yet. Ask the administrator to finish the SMS setup.' });
    }
    return respond(res, 502, { error: 'We could not send a verification code right now. Please try again shortly.' });
  }
}
