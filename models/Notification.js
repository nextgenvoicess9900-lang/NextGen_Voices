const mongoose = require('mongoose');

/**
 * Notification — admin-only broadcast messages. Extended to support the
 * homepage popup system: category (for icon/accent color), an optional
 * destination link, pin/urgent flags, and real scheduling (scheduledFor
 * lets an admin queue a notification for the future; it simply won't be
 * returned by the public endpoint until that time passes).
 */
const NOTIFICATION_CATEGORIES = [
  'scholarship', 'competition', 'internship', 'research', 'article',
  'reel', 'announcement', 'event', 'update', 'community', 'urgent',
];

const notificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    category: { type: String, enum: NOTIFICATION_CATEGORIES, default: 'announcement' },
    priority: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
    link: { type: String, trim: true }, // e.g. /#/explore/post/<id> — where "View" navigates
    pinned: { type: Boolean, default: false },
    urgent: { type: Boolean, default: false },
    scheduledFor: { type: Date, default: Date.now }, // not shown publicly before this time
    expiryDate: { type: Date },
    published: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  },
  { timestamps: true }
);

notificationSchema.statics.CATEGORIES = NOTIFICATION_CATEGORIES;

module.exports = mongoose.model('Notification', notificationSchema);
