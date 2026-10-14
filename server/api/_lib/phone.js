export function normalizePhone(value) {
  let raw = String(value || '').trim();
  if (!raw) return null;
  raw = raw.replace(/[\s().-]/g, '');
  if (raw.startsWith('00')) raw = `+${raw.slice(2)}`;
  const hadPlus = raw.startsWith('+');
  let digits = raw.replace(/\D/g, '');
  if (hadPlus && digits.length === 10) digits = `91${digits}`; // normalize legacy records that stored + before a 10-digit Indian mobile
  if (!hadPlus) {
    // Indian mobile numbers are the default for the current deployment.
    if (digits.length === 10) digits = `91${digits}`;
    else if (digits.length === 12 && digits.startsWith('91')) { /* already country-coded */ }
    else if (digits.length < 11 || digits.length > 15) return null;
  }
  if (digits.length < 10 || digits.length > 15) return null;
  return `+${digits}`;
}

export function maskPhone(value) {
  const phone = String(value || '');
  return phone.length > 6 ? `${phone.slice(0, 3)}••••${phone.slice(-3)}` : 'your registered number';
}
