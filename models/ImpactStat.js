const mongoose = require('mongoose');

/**
 * ImpactStat — the hand-curated numbers shown on the Live Impact
 * Dashboard (Students Supported, Scholarships Funded, etc.). These are
 * intentionally NOT auto-computed from Donations — a single donation
 * doesn't map cleanly to "how many students were supported", so an Admin
 * sets/updates these directly, the same way a real nonprofit dashboard's
 * headline numbers are usually curated rather than derived.
 */
const impactStatSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // e.g. 'students_supported'
    label: { type: String, required: true, trim: true },
    icon: { type: String, default: '✨' },
    value: { type: Number, required: true, default: 0 },
    monthlyIncrease: { type: Number, default: 0 },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ImpactStat', impactStatSchema);
