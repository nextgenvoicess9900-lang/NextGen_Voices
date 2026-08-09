const mongoose = require('mongoose');

/**
 * Registration — one Viewer's registration for one Workshop. Attendance,
 * assessment eligibility, and certificates all key off this document's
 * status, never off the Workshop directly, so a cancelled registration
 * cleanly revokes downstream access without touching other records.
 */
const registrationSchema = new mongoose.Schema(
  {
    workshop: { type: mongoose.Schema.Types.ObjectId, ref: 'Workshop', required: true },
    viewer: { type: mongoose.Schema.Types.ObjectId, ref: 'Viewer', required: true },
    status: { type: String, enum: ['registered', 'waitlisted', 'cancelled'], default: 'registered' },

    additionalInfo: {
      institution: { type: String, trim: true },
      department: { type: String, trim: true },
      year: { type: String, trim: true },
      phone: { type: String, trim: true },
      country: { type: String, trim: true },
      customAnswers: [{ question: { type: String, trim: true }, answer: { type: String, trim: true } }],
    },

    registeredAt: { type: Date, default: Date.now },
    cancelledAt: { type: Date },
    cancellationReason: { type: String, trim: true },
  },
  { timestamps: true }
);

// A viewer can only have one active (non-cancelled) registration per workshop —
// enforced at the application layer in the controller (partial unique
// indexes on status are possible but add complexity not needed yet).
registrationSchema.index({ workshop: 1, viewer: 1 });
registrationSchema.index({ workshop: 1, status: 1 });

module.exports = mongoose.model('Registration', registrationSchema);
