const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const Editor = require('../models/Editor');
const PendingEditor = require('../models/PendingEditor');
const Viewer = require('../models/Viewer');
const asyncHandler = require('../utils/asyncHandler');
const { signToken, cookieOptions } = require('../utils/tokens');
const { sanitizePlainText } = require('../utils/sanitizeContent');
const logActivity = require('../utils/logActivity');
const { generateCsrfToken } = require('../middleware/csrf');
const { generateOtp, hashOtp, verifyOtpHash, OTP_TTL_MS, OTP_RESEND_COOLDOWN_MS, OTP_MAX_ATTEMPTS } = require('../utils/otp');
const { sendOtpEmail } = require('../utils/mailer');

const SALT_ROUNDS = 12;

/**
 * POST /api/auth/admin/login
 * Admin credentials are never hardcoded — the account is created once via
 * `npm run seed:admin`, which reads SEED_ADMIN_USER_ID / SEED_ADMIN_PASSWORD
 * from the environment and stores only a bcrypt hash.
 */
const adminLogin = asyncHandler(async (req, res) => {
  const { userId, password } = req.body;
  const admin = await Admin.findOne({ userId: sanitizePlainText(userId) });

  // Constant-shape response whether the user exists or not, to avoid
  // leaking which accounts are valid.
  const valid = admin && (await bcrypt.compare(password, admin.passwordHash));
  if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

  admin.lastLoginAt = new Date();
  await admin.save();

  const token = signToken({ id: admin._id, role: 'admin', name: admin.name });
  res.cookie('nextgen_session', token, cookieOptions());
  const csrfToken = generateCsrfToken(req, res);

  res.json({ user: { id: admin._id, role: 'admin', name: admin.name }, csrfToken });
});

const { ALLOWED_EXPERTISE } = require('../models/Editor');

/** Light sanitizing for optional profile URLs — strips markup, trims, and
 *  requires an http(s) scheme so these can't become javascript: links. */
function sanitizeUrl(raw) {
  const val = sanitizePlainText(raw || '');
  if (!val) return '';
  return /^https?:\/\//i.test(val) ? val : `https://${val}`;
}

/**
 * POST /api/auth/editor/register
 * Creates a PendingEditor. The account cannot log in until an Admin
 * explicitly accepts it (see editorController.acceptEditor). No
 * verification documents are requested here — the Admin reviews the
 * profile itself (bio, title, expertise) and decides.
 */
const registerEditor = asyncHandler(async (req, res) => {
  const {
    fullName, email, institution, phone, username, password,
    publicDisplayName, professionalTitle, bio, tagline,
    agreedToGuidelines, agreedToReview,
  } = req.body;

  const existing = await Editor.findOne({ username: username.toLowerCase() });
  const existingPending = await PendingEditor.findOne({ username: username.toLowerCase() });
  if (existing || existingPending) {
    return res.status(409).json({ error: 'That username is already in use or pending review.' });
  }

  if (agreedToGuidelines !== 'true' && agreedToGuidelines !== true) {
    return res.status(400).json({ error: 'You must agree to the NEXTGEN Community Guidelines.' });
  }
  if (agreedToReview !== 'true' && agreedToReview !== true) {
    return res.status(400).json({ error: 'You must acknowledge that your application will be reviewed.' });
  }

  // areasOfExpertise arrives as a repeated form field (array) or a single
  // value depending on how many boxes were checked — normalize to an array,
  // then drop anything outside the fixed checklist rather than trusting it.
  let areasOfExpertise = req.body.areasOfExpertise || [];
  if (!Array.isArray(areasOfExpertise)) areasOfExpertise = [areasOfExpertise];
  areasOfExpertise = areasOfExpertise.filter((v) => ALLOWED_EXPERTISE.includes(v));

  const socialLinks = {
    linkedin: sanitizeUrl(req.body['socialLinks[linkedin]'] || req.body.socialLinks?.linkedin),
    github: sanitizeUrl(req.body['socialLinks[github]'] || req.body.socialLinks?.github),
    portfolio: sanitizeUrl(req.body['socialLinks[portfolio]'] || req.body.socialLinks?.portfolio),
    website: sanitizeUrl(req.body['socialLinks[website]'] || req.body.socialLinks?.website),
    twitter: sanitizeUrl(req.body['socialLinks[twitter]'] || req.body.socialLinks?.twitter),
  };

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const pending = await PendingEditor.create({
    fullName: sanitizePlainText(fullName),
    email: sanitizePlainText(email),
    institution: sanitizePlainText(institution),
    phone: sanitizePlainText(phone),
    username: username.toLowerCase(),
    passwordHash,
    profilePhoto: req.file ? `/uploads/${req.file.filename}` : '',
    publicDisplayName: sanitizePlainText(publicDisplayName || fullName),
    professionalTitle: sanitizePlainText(professionalTitle),
    bio: sanitizePlainText(bio).slice(0, 500),
    tagline: sanitizePlainText(tagline).slice(0, 80),
    areasOfExpertise,
    socialLinks,
    agreedToGuidelines: true,
    agreedToReview: true,
  });

  res.status(201).json({
    message: 'Registration submitted. Your account is pending Admin approval. Estimated review time: 24–48 hours.',
    id: pending._id,
  });
});

/**
 * POST /api/auth/editor/login
 * Only succeeds for accounts already promoted out of PendingEditor.
 */
const editorLogin = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const editor = await Editor.findOne({ username: (username || '').toLowerCase() });

  const isPending = !editor && (await PendingEditor.exists({ username: (username || '').toLowerCase() }));
  const valid = editor && (await bcrypt.compare(password, editor.passwordHash));

  if (!valid) {
    if (isPending) {
      return res.status(403).json({ error: 'Your account is still pending Admin approval.' });
    }
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  editor.lastLoginAt = new Date();
  await editor.save();

  const token = signToken({ id: editor._id, role: 'editor', name: editor.fullName });
  res.cookie('nextgen_session', token, cookieOptions());
  const csrfToken = generateCsrfToken(req, res);

  res.json({ user: { id: editor._id, role: 'editor', name: editor.fullName }, csrfToken });
});

/**
 * POST /api/auth/viewer/request-otp
 * The only "sign up or log in" entry point for students. No password, no
 * Admin approval — the account is created on first request (if it doesn't
 * exist yet) and a one-time code is emailed to the address given. Anyone
 * who can read that inbox can complete login; there is nothing else to
 * verify. A resend cooldown and per-code attempt limit (see utils/otp.js)
 * are the only anti-abuse measures needed for this flow.
 */
const requestViewerOtp = asyncHandler(async (req, res) => {
  const { email, fullName, institution } = req.body;
  const normalizedEmail = email.toLowerCase();

  let viewer = await Viewer.findOne({ email: normalizedEmail }).select('+otpLastSentAt');
  if (!viewer) {
    viewer = await Viewer.create({
      email: normalizedEmail,
      fullName: fullName ? sanitizePlainText(fullName) : '',
      institution: institution ? sanitizePlainText(institution) : '',
    });
  } else {
    // Resend cooldown — prevents someone from hammering the mail server /
    // the recipient's inbox by repeatedly hitting this endpoint.
    if (viewer.otpLastSentAt && Date.now() - viewer.otpLastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
      const waitSec = Math.ceil((OTP_RESEND_COOLDOWN_MS - (Date.now() - viewer.otpLastSentAt.getTime())) / 1000);
      return res.status(429).json({ error: `Please wait ${waitSec}s before requesting another code.` });
    }
    if (fullName && !viewer.fullName) viewer.fullName = sanitizePlainText(fullName);
    if (institution) viewer.institution = sanitizePlainText(institution);
  }

  const code = generateOtp();
  viewer.otpHash = hashOtp(code);
  viewer.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
  viewer.otpAttempts = 0;
  viewer.otpLastSentAt = new Date();
  await viewer.save();

  await sendOtpEmail(normalizedEmail, code);

  res.json({ message: 'A login code has been sent to your email.', email: normalizedEmail });
});

/**
 * POST /api/auth/viewer/verify-otp
 * Verifies the code and, on success, signs the viewer in — establishing
 * the exact same session cookie mechanism Admin/Editor use, just reached
 * via a different front door.
 */
const verifyViewerOtp = asyncHandler(async (req, res) => {
  const { email, code } = req.body;
  const normalizedEmail = (email || '').toLowerCase();

  const viewer = await Viewer.findOne({ email: normalizedEmail }).select('+otpHash +otpExpiresAt +otpAttempts');
  if (!viewer || !viewer.otpHash || !viewer.otpExpiresAt) {
    return res.status(400).json({ error: 'No login code is pending for this email. Please request a new one.' });
  }
  if (viewer.otpExpiresAt.getTime() < Date.now()) {
    return res.status(400).json({ error: 'This code has expired. Please request a new one.' });
  }
  if (viewer.otpAttempts >= OTP_MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new code.' });
  }

  const valid = verifyOtpHash(String(code || '').trim(), viewer.otpHash);
  if (!valid) {
    viewer.otpAttempts += 1;
    await viewer.save();
    const remaining = OTP_MAX_ATTEMPTS - viewer.otpAttempts;
    return res.status(401).json({ error: `Incorrect code.${remaining > 0 ? ` ${remaining} attempt(s) left.` : ' Please request a new code.'}` });
  }

  // Success — clear the OTP state so it can't be reused, mark verified, sign in.
  viewer.otpHash = undefined;
  viewer.otpExpiresAt = undefined;
  viewer.otpAttempts = 0;
  viewer.emailVerified = true;
  viewer.lastLoginAt = new Date();
  await viewer.save();

  const token = signToken({ id: viewer._id, role: 'viewer', name: viewer.fullName || viewer.email });
  res.cookie('nextgen_session', token, cookieOptions());
  const csrfToken = generateCsrfToken(req, res);

  res.json({ user: { id: viewer._id, role: 'viewer', name: viewer.fullName || viewer.email }, csrfToken });
});

/** GET /api/auth/me — used by the frontend on load to restore session state. */
const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});

/** POST /api/auth/logout */
const logout = asyncHandler(async (req, res) => {
  res.clearCookie('nextgen_session', { path: '/' });
  res.json({ message: 'Logged out.' });
});

module.exports = { adminLogin, registerEditor, editorLogin, requestViewerOtp, verifyViewerOtp, me, logout };
