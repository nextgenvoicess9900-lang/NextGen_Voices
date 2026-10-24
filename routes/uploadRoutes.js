const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ctrl = require('../controllers/uploadController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { doubleCsrfProtection } = require('../middleware/csrf');

const router = express.Router();

/* PDFs are included because WorkshopResource.type has a first-class 'pdf'
   type whose fileUrl must come from this endpoint — rejecting application/pdf
   here made the documented "upload a PDF resource" workflow impossible. */
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'application/pdf']);

/* multer's diskStorage does NOT create its destination directory — if the
   folder is missing (fresh clone, first boot, wiped deploy) every upload
   fails with a 500 (ENOENT) even though the file and user are valid. Create
   it once at module load so uploads work from a clean checkout. */
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
fs.mkdirSync(path.join(__dirname, '..', UPLOAD_DIR), { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: (Number(process.env.MAX_UPLOAD_MB) || 8) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('Unsupported file type.'));
    }
    cb(null, true);
  },
});

router.post(
  '/',
  authenticate,
  authorize('admin', 'editor'),
  doubleCsrfProtection,
  upload.single('file'),
  ctrl.uploadFile
);

module.exports = router;
