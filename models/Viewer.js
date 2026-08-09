const mongoose = require('mongoose');

/**
 * Viewer — a student/visitor account. Distinct from Admin/Editor: viewers
 * have no access to the admin dashboard at all, and no admin approval step
 * either — anyone can self-serve an account. They exist so the site can
 * send them email notifications and let them book one-on-one counseling
 * sessions. Browsing posts/notifications/articles never requires an
 * account — that stays fully public.
 *
 * Auth is passwordless: a one-time code is emailed to the address on file
 * and verified against `otpHash` (never the plaintext code). There is no
 * password field at all — possession of the registered inbox IS the
 * credential, by design.
 */
const viewerSchema = new mongoose.Schema(
  {
    fullName: { type: String, trim: true, default: '' },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    institution: { type: String, trim: true },
    emailNotifications: { type: Boolean, default: true }, // opt-in/out of notification emails
    emailVerified: { type: Boolean, default: false }, // flips true the first time an OTP is successfully verified

    // One-time-passcode state — never store the code itself, only its hash.
    otpHash: { type: String, select: false },
    otpExpiresAt: { type: Date, select: false },
    otpAttempts: { type: Number, default: 0, select: false },
    otpLastSentAt: { type: Date, select: false }, // used to enforce a resend cooldown

    lastLoginAt: { type: Date },

    // Personalization — set via Settings ("My Interests"), hashtag Follow
    // buttons, and editor Follow buttons. Real, persisted fields powering
    // the For You feed; nothing fabricated here.
    interests: [{ type: String, trim: true }],
    followedHashtags: [{ type: String, trim: true }],
    followedEditors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Editor' }],

    // Capped reading history (most recent 100 posts viewed), used as a real
    // signal for the recommendation engine. Newest first.
    readingHistory: [
      {
        _id: false,
        post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
        viewedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Viewer', viewerSchema);
