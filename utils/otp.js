const crypto = require('crypto');

const OTP_LENGTH = 6;
const OTP_TTL_MS = 10 * 60 * 1000;      // code valid for 10 minutes
const OTP_RESEND_COOLDOWN_MS = 45 * 1000; // must wait 45s between sends to the same address
const OTP_MAX_ATTEMPTS = 5;               // wrong-code guesses allowed before the code is invalidated

/** Generates a cryptographically random 6-digit numeric code as a string (may have leading zeros). */
function generateOtp() {
  const num = crypto.randomInt(0, 10 ** OTP_LENGTH);
  return String(num).padStart(OTP_LENGTH, '0');
}

/**
 * Hashes an OTP with a server-side pepper (JWT_SECRET) using HMAC-SHA256.
 * A plain fast hash is fine here — unlike passwords, OTPs are short-lived
 * (10 min) and rate/attempt-limited, so brute force isn't a realistic
 * threat the way it is for password hashes; bcrypt's slowness buys nothing
 * extra here and would just slow down every login.
 */
function hashOtp(code) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update(code).digest('hex');
}

function verifyOtpHash(code, hash) {
  const expected = hashOtp(code);
  // Constant-time comparison to avoid leaking match progress via timing.
  const a = Buffer.from(expected);
  const b = Buffer.from(hash || '');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { generateOtp, hashOtp, verifyOtpHash, OTP_TTL_MS, OTP_RESEND_COOLDOWN_MS, OTP_MAX_ATTEMPTS };
