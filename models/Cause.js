const mongoose = require('mongoose');

/**
 * Cause — a fundable campaign shown in "Opportunity of the Day" and the
 * "Opportunities You Can Support" grid (e.g. "Support NextGen Astronomy
 * Research", "Women in STEM"). `raisedAmount` and `supporterCount` are
 * denormalized counters kept in sync by donationController whenever a
 * donation is verified — so the progress bar never needs to re-aggregate
 * the whole Donation collection on every page load.
 */
const causeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, required: true, trim: true },
    category: { type: String, trim: true, default: 'General' },
    coverImage: { type: String, default: '' },
    goalAmount: { type: Number, required: true, min: 1 },
    raisedAmount: { type: Number, default: 0 },
    supporterCount: { type: Number, default: 0 },
    featured: { type: Boolean, default: false }, // shown as "Opportunity of the Day"
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  },
  { timestamps: true }
);

causeSchema.index({ active: 1, featured: 1 });

module.exports = mongoose.model('Cause', causeSchema);
