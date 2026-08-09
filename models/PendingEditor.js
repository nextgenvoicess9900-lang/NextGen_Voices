const mongoose = require('mongoose');
const { ALLOWED_EXPERTISE } = require('./Editor');

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
 * PendingEditor — created when someone submits the Editor Registration form.
 * Lives here until an Admin either:
 *   - Accepts access  -> document is copied into the Editor collection and removed here
 *   - Revokes access  -> document is deleted permanently
 * There are intentionally no other states (no toggles / partial approval).
 * No verification documents are collected here by design — the Admin
 * decides based on this profile (writing sample expectations happen after
 * approval, in the editor's first drafts), not paperwork.
 */
const pendingEditorSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    institution: { type: String, trim: true },
    phone: { type: String, trim: true },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    profilePhoto: { type: String, default: '' },

    publicDisplayName: { type: String, trim: true, maxlength: 60 },
    professionalTitle: { type: String, trim: true, maxlength: 80 },
    bio: { type: String, trim: true, maxlength: 500, default: '' },
    tagline: { type: String, trim: true, maxlength: 80, default: '' },
    areasOfExpertise: { type: [String], default: [], validate: (arr) => arr.every((v) => ALLOWED_EXPERTISE.includes(v)) },
    socialLinks: { type: socialLinksSchema, default: () => ({}) },

    agreedToGuidelines: { type: Boolean, required: true },
    agreedToReview: { type: Boolean, required: true },

    status: { type: String, enum: ['pending'], default: 'pending' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PendingEditor', pendingEditorSchema);
