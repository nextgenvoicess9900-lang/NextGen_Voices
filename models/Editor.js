const mongoose = require('mongoose');

const ALLOWED_EXPERTISE = [
  'Research', 'Scholarships', 'Competitions', 'Opportunities', 'Space', 'AI',
  'Engineering', 'Robotics', 'Cybersecurity', 'Environment', 'Biotechnology',
  'Medicine', 'Business', 'Economics', 'Psychology', 'Law', 'Design', 'Literature',
];

const socialLinksSchema = new mongoose.Schema(
  {
    linkedin: { type: String, trim: true, default: '' },
    github: { type: String, trim: true, default: '' },
    portfolio: { type: String, trim: true, default: '' },
    website: { type: String, trim: true, default: '' },
    twitter: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

/**
 * Editor — an approved content contributor. Editors can only manage their
 * own posts and answer viewer questions; all other admin-only actions are
 * enforced server-side in middleware/authorize.js, not just hidden in the UI.
 *
 * The public-profile fields below (publicDisplayName, professionalTitle,
 * bio, tagline, areasOfExpertise, socialLinks) are collected once at
 * registration and never re-verified — every account in this collection
 * was manually approved by an Admin (see editorController.acceptEditor),
 * so being here at all IS the "Verified NEXTGEN Editor" badge. There is
 * no separate `verified` flag to drift out of sync.
 */
const editorSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    institution: { type: String, trim: true },
    phone: { type: String, trim: true },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    profilePhoto: { type: String, default: '' },

    // Public byline identity — shown beneath every published post.
    publicDisplayName: { type: String, trim: true, maxlength: 60 },
    professionalTitle: { type: String, trim: true, maxlength: 80 },
    bio: { type: String, trim: true, maxlength: 500, default: '' },
    tagline: { type: String, trim: true, maxlength: 80, default: '' },
    areasOfExpertise: { type: [String], default: [], validate: (arr) => arr.every((v) => ALLOWED_EXPERTISE.includes(v)) },
    socialLinks: { type: socialLinksSchema, default: () => ({}) },

    // Kept for the Admin review trail, not re-checked after approval.
    agreedToGuidelines: { type: Boolean, default: false },
    agreedToReview: { type: Boolean, default: false },

    status: { type: String, enum: ['active'], default: 'active' },
    approvedAt: { type: Date, default: Date.now },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

editorSchema.index({ username: 1 });
editorSchema.virtual('displayName').get(function () {
  return this.publicDisplayName || this.fullName;
});
editorSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Editor', editorSchema);
module.exports.ALLOWED_EXPERTISE = ALLOWED_EXPERTISE;
