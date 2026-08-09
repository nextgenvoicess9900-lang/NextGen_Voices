const jwt = require('jsonwebtoken');

/** Signs a short-lived JWT carrying only non-sensitive identity claims. */
function signToken({ id, role, name }) {
  return jwt.sign({ sub: id, role, name }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '2h',
  });
}

/** Options for the httpOnly session cookie. */
function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 2 * 60 * 60 * 1000, // 2h, keep in sync with JWT_EXPIRES_IN
    path: '/',
  };
}

module.exports = { signToken, cookieOptions };
