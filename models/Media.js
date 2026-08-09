const mongoose = require('mongoose');

/** Media — metadata for uploaded files (images/video); binary lives on disk/S3. */
const mediaSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    url: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'uploadedByRole' },
    uploadedByRole: { type: String, enum: ['Admin', 'Editor'], required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Media', mediaSchema);
