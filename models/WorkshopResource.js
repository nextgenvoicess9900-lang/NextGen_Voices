const mongoose = require('mongoose');

/**
 * WorkshopResource — post-workshop materials (presentation, PDF, recording,
 * minutes of meeting, links). Visibility is enforced in the controller at
 * read-time, not just hidden in the UI: a 'attended' resource is invisible
 * to a registered-but-absent student even if they know the URL pattern.
 */
const workshopResourceSchema = new mongoose.Schema(
  {
    workshop: { type: mongoose.Schema.Types.ObjectId, ref: 'Workshop', required: true },
    type: { type: String, enum: ['presentation', 'pdf', 'mom', 'recording', 'code', 'link', 'other'], required: true },
    title: { type: String, trim: true, required: true },
    fileUrl: { type: String, trim: true, default: '' },
    externalLink: { type: String, trim: true, default: '' },
    fileSizeLabel: { type: String, trim: true, default: '' }, // e.g. "2.4 MB" — cosmetic only, not authoritative

    visibility: { type: String, enum: ['public', 'registered', 'attended'], default: 'registered' },
    releaseTiming: { type: String, enum: ['immediately', 'afterWorkshop', 'custom'], default: 'immediately' },
    releaseAt: { type: Date },

    uploadedBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'uploadedByRole', required: true },
    uploadedByRole: { type: String, enum: ['Admin', 'Editor'], required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WorkshopResource', workshopResourceSchema);
