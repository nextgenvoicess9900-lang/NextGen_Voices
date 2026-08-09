const mongoose = require('mongoose');

/**
 * UserNotification — a personal, per-viewer notification (distinct from
 * the existing `Notification` model, which is an admin-published public
 * broadcast feed). This is the "website notification" half of Chapter 3's
 * reminder system; "popup" is the same event shown as an immediate toast
 * client-side at creation time. Email/SMS aren't sent from here — see
 * workshop-module-plan.md §0.6 for why.
 */
const userNotificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'Viewer', required: true },
    workshop: { type: mongoose.Schema.Types.ObjectId, ref: 'Workshop' },
    type: { type: String, trim: true, required: true }, // e.g. 'registration-confirmed', 'waitlist-promoted'
    title: { type: String, trim: true, required: true },
    message: { type: String, trim: true, required: true },
    link: { type: String, trim: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userNotificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.model('UserNotification', userNotificationSchema);
