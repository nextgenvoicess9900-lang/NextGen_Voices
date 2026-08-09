const mongoose = require('mongoose');

/**
 * WorkshopAnnouncement — distinct from the existing platform-wide
 * `Announcement` model (that one is public/editors-only site news,
 * unrelated to a specific workshop). This one targets a workshop's own
 * registered/attended participants and is delivered as real
 * UserNotification documents (website) at send time — see
 * announcementController.sendWorkshopAnnouncement.
 */
const workshopAnnouncementSchema = new mongoose.Schema(
  {
    workshop: { type: mongoose.Schema.Types.ObjectId, ref: 'Workshop', required: true },
    title: { type: String, trim: true, required: true, maxlength: 150 },
    body: { type: String, trim: true, required: true, maxlength: 2000 },
    audience: { type: String, enum: ['registered', 'attended'], default: 'registered' },
    // Which channels were actually attempted at send time. Website is
    // always real; email/sms are logged only — see plan §0.6.
    channels: { type: [String], default: ['website'] },
    recipientCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WorkshopAnnouncement', workshopAnnouncementSchema);
