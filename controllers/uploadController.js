const Media = require('../models/Media');
const asyncHandler = require('../utils/asyncHandler');

/**
 * POST /api/uploads — Admin/Editor. Actual file handling is done by the
 * multer middleware configured in routes/uploadRoutes.js (which enforces
 * file-type and size limits); this controller just records the metadata.
 */
const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const media = await Media.create({
    filename: req.file.filename,
    url: `/uploads/${req.file.filename}`,
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploadedBy: req.user.id,
    uploadedByRole: req.user.role === 'admin' ? 'Admin' : 'Editor',
  });

  res.status(201).json(media);
});

module.exports = { uploadFile };
