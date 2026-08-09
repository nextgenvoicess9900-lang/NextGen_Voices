const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Editor = require('../models/Editor');
const Viewer = require('../models/Viewer');

const ROLE_MODELS = { admin: Admin, editor: Editor, viewer: Viewer };

/**
 * Verifies the JWT stored in the httpOnly session cookie and attaches
 * `req.user = { id, role, name }` to the request. Rejects with 401 if the
 * token is missing/invalid, or if the underlying account no longer exists
 * (e.g. an editor who was revoked, or a viewer who deleted their account,
 * after their token was issued).
 *
 * Three roles share this one session mechanism: 'admin', 'editor', 'viewer'.
 * Admin/Editor sessions unlock the dashboard; Viewer sessions unlock only
 * the student-facing account features (notification preferences, booking
 * counseling slots) — never the admin dashboard routes.
 */
async function authenticate(req, res, next) {
  try {
    const token = req.cookies?.nextgen_session;
    if (!token) return res.status(401).json({ error: 'Not authenticated.' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const Model = ROLE_MODELS[payload.role];
    if (!Model) return res.status(401).json({ error: 'Unknown session role.' });

    const account = await Model.findById(payload.sub).select('_id username userId fullName name email');
    if (!account) return res.status(401).json({ error: 'Account no longer exists.' });

    req.user = {
      id: account._id.toString(),
      role: payload.role, // 'admin' | 'editor' | 'viewer'
      name: account.fullName || account.name || account.userId || account.email,
      email: account.email,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
}

/**
 * Like `authenticate`, but never rejects the request — used on public
 * endpoints (e.g. viewing a post) that want to know *who's* viewing when
 * possible (to flag "you already liked this") without requiring login.
 */
async function authenticateOptional(req, res, next) {
  const token = req.cookies?.nextgen_session;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const Model = ROLE_MODELS[payload.role];
    const account = Model && await Model.findById(payload.sub).select('_id username userId fullName name email');
    if (account) {
      req.user = { id: account._id.toString(), role: payload.role, name: account.fullName || account.name || account.userId || account.email, email: account.email };
    }
  } catch (err) { /* invalid/expired token — just proceed unauthenticated */ }
  next();
}

module.exports = authenticate;
module.exports.authenticateOptional = authenticateOptional;
