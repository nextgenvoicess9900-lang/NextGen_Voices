const mongoose = require('mongoose');

/**
 * Announcement — admin-only, supports immediate publish or scheduling.
 * A cron job (see utils/scheduler.js) flips `status` from 'scheduled'
 * to 'published' once `scheduleDate` has passed.
 */
const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    bannerImage: { type: String, default: '' },
    category: { type: String, trim: true },
    visibility: { type: String, enum: ['public', 'editors-only'], default: 'public' },
    publishDate: { type: Date },
    scheduleDate: { type: Date },
    status: { type: String, enum: ['draft', 'scheduled', 'published'], default: 'draft' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Announcement', announcementSchema);
