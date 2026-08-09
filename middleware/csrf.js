const { doubleCsrf } = require('csrf-csrf');

/**
 * Double-submit-cookie CSRF protection. The server sets a readable
 * `nextgen_csrf` cookie; the frontend must echo its value back in the
 * `x-csrf-token` header on every state-changing request. Because the
 * session cookie is httpOnly (unreadable to JS) but this one is not,
 * a cross-site attacker cannot forge a matching pair.
 */
const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET,
  cookieName: 'nextgen_csrf',
  cookieOptions: {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  },
  size: 64,
  getTokenFromRequest: (req) => req.headers['x-csrf-token'],
});

module.exports = { doubleCsrfProtection, generateCsrfToken };
