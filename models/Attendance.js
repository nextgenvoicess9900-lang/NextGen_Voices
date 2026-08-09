const mongoose = require('mongoose');

/**
 * Attendance — one record per Registration. This is the single source of
 * truth for assessment eligibility ("only students marked Attended for
 * THIS workshop may take THIS assessment") — see Chapter 4's non-negotiable
 * rule. Nothing else in the system should infer attendance independently.
 */
const attendanceSchema = new mongoose.Schema(
  {
    workshop: { type: mongoose.Schema.Types.ObjectId, ref: 'Workshop', required: true },
    registration: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration', required: true, unique: true },
    viewer: { type: mongoose.Schema.Types.ObjectId, ref: 'Viewer', required: true },

    method: { type: String, enum: ['google-meet', 'zoom', 'ms-teams', 'manual', 'qr'], default: 'manual' },
    joinedAt: { type: Date },
    leftAt: { type: Date },
    durationMinutes: { type: Number, default: 0 },
    percentage: { type: Number, default: 0, min: 0, max: 100 },

    status: { type: String, enum: ['present', 'absent', 'partial'], default: 'absent' },

    // Manual verification/override — every attendance change is attributable.
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'verifiedByRole' },
    verifiedByRole: { type: String, enum: ['Admin', 'Editor'] },
    verifiedAt: { type: Date },
  },
  { timestamps: true }
);

attendanceSchema.index({ workshop: 1, status: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
