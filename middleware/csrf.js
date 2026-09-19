const { doubleCsrf } = require('csrf-csrf');
const crypto = require('crypto');

/**
 * Secret: CSRF_SECRET is the intended production key. In dev/preview it may
 * be unset — fall back to COOKIE_SECRET, then a per-boot random secret with a
 * loud warning so tokens still work within a server run instead of crashing
 * every request. A random per-boot secret only means tokens die on restart,
 * which is harmless: the frontend re-fetches /api/csrf-token on load.
 */
let bootSecret = null;
function resolveCsrfSecret() {
  if (process.env.CSRF_SECRET) return process.env.CSRF_SECRET;
  if (process.env.COOKIE_SECRET) return process.env.COOKIE_SECRET;
  if (!bootSecret) {
    bootSecret = crypto.randomBytes(32).toString('hex');
    console.warn('[csrf] CSRF_SECRET/COOKIE_SECRET not set — using a random per-boot secret. Set CSRF_SECRET in Keys for stable tokens.');
  }
  return bootSecret;
}

/**
 * Double-submit-cookie CSRF protection. The server sets a readable
 * `nextgen_csrf` cookie; the frontend must echo its value back in the
 * `x-csrf-token` header on every state-changing request. Because the
 * session cookie is httpOnly (unreadable to JS) but this one is not,
 * a cross-site attacker cannot forge a matching pair.
 *
 * csrf-csrf v3 exports { generateToken, validateRequest, doubleCsrfProtection }
 * (older docs named the generator generateCsrfToken). We keep our historical
 * export names and normalize the generator's return value, which is a plain
 * token string in some v3 minors and { token, cookie } in others.
 */
const {
  generateToken,
  doubleCsrfProtection,
  invalidCsrfTokenError,
} = doubleCsrf({
  getSecret: resolveCsrfSecret,
  cookieName: 'nextgen_csrf',
  cookieOptions: {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  },
  size: 64,
  getTokenFromRequest: (req) => req.headers['x-csrf-token'],
});

function generateCsrfToken(req, res) {
  const result = generateToken(req, res);
  if (typeof result === 'string') return result;
  return (result && result.token) || '';
}

module.exports = { doubleCsrfProtection, generateCsrfToken, invalidCsrfTokenError };
