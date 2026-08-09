const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { body } = require('express-validator');
const ctrl = require('../controllers/authController');
const authenticate = require('../middleware/authenticate');
const { authLimiter } = require('../middleware/rateLimiters');
const validate = require('../middleware/validate');
const { ALLOWED_EXPERTISE } = require('../models/Editor');

const router = express.Router();

// Editor-registration profile pictures land in the same uploads dir as
// everything else, but this multer instance is deliberately separate from
// uploadRoutes.js's — this one runs with NO auth (registration happens
// before an account exists), so it only ever accepts images, never video.
const REGISTER_PHOTO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const registerPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, process.env.UPLOAD_DIR || 'uploads'),
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(REGISTER_PHOTO_MIME.has(file.mimetype) ? null : new Error('Profile picture must be a JPG, PNG, or WebP image.'), REGISTER_PHOTO_MIME.has(file.mimetype)),
});

router.post(
  '/admin/login',
  authLimiter,
  [body('userId').trim().notEmpty(), body('password').isString().notEmpty()],
  validate,
  ctrl.adminLogin
);

router.post(
  '/editor/register',
  authLimiter,
  registerPhotoUpload.single('profilePicture'),
  [
    body('fullName').trim().notEmpty(),
    body('email').isEmail().normalizeEmail(),
    body('publicDisplayName').trim().notEmpty().isLength({ max: 60 }),
    body('professionalTitle').trim().notEmpty().isLength({ max: 80 }),
    body('bio').trim().notEmpty().isLength({ max: 500 }),
    body('tagline').optional({ checkFalsy: true }).trim().isLength({ max: 80 }),
    body('areasOfExpertise').optional().custom((val) => {
      const arr = Array.isArray(val) ? val : [val];
      return arr.every((v) => ALLOWED_EXPERTISE.includes(v));
    }),
    body('username').trim().isLength({ min: 3 }).matches(/^[a-zA-Z0-9_.]+$/),
    body('password').isStrongPassword({ minLength: 8, minNumbers: 1, minUppercase: 1, minSymbols: 1 }),
    body('confirmPassword').custom((val, { req }) => val === req.body.password),
    body('agreedToGuidelines').custom((val) => val === 'true' || val === true),
    body('agreedToReview').custom((val) => val === 'true' || val === true),
  ],
  validate,
  ctrl.registerEditor
);

router.post(
  '/editor/login',
  authLimiter,
  [body('username').trim().notEmpty(), body('password').isString().notEmpty()],
  validate,
  ctrl.editorLogin
);

router.post(
  '/viewer/request-otp',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('fullName').optional({ checkFalsy: true }).trim().isLength({ max: 120 }),
    body('institution').optional({ checkFalsy: true }).trim().isLength({ max: 160 }),
  ],
  validate,
  ctrl.requestViewerOtp
);

router.post(
  '/viewer/verify-otp',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('code').trim().isLength({ min: 6, max: 6 }).isNumeric(),
  ],
  validate,
  ctrl.verifyViewerOtp
);

router.get('/me', authenticate, ctrl.me);
router.post('/logout', authenticate, ctrl.logout);

module.exports = router;
