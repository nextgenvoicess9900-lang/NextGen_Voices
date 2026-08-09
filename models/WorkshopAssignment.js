const mongoose = require('mongoose');

/**
 * WorkshopAssignment — links an Editor to a Workshop for operational
 * duties (the spec's "Volunteer"). There is no separate Volunteer role or
 * account: any Editor can be assigned to any workshop by an Admin, and the
 * moment they're assigned, that workshop's operations UI (checklist,
 * resource upload, attendance if permitted) unlocks for them — and only
 * for that workshop. See workshop-module-plan.md §0.1–0.3 for why.
 */
const CHECKLIST_DEFAULTS = [
  'Verify registrations',
  'Join meeting 30 minutes early',
  'Assist speaker',
  'Moderate chat',
  'Verify attendance',
  'Upload presentation',
  'Upload PDF notes',
  'Upload minutes of meeting',
  'Upload recording',
  'Publish workshop resources',
];

const workshopAssignmentSchema = new mongoose.Schema(
  {
    workshop: { type: mongoose.Schema.Types.ObjectId, ref: 'Workshop', required: true },
    editor: { type: mongoose.Schema.Types.ObjectId, ref: 'Editor', required: true },

    role: {
      type: String,
      enum: ['moderator', 'speaker-support', 'resource-manager', 'attendance', 'general'],
      default: 'general',
    },
    canMarkAttendance: { type: Boolean, default: false },

    reportingTime: { type: String, trim: true },
    checklist: [{
      label: { type: String, trim: true },
      done: { type: Boolean, default: false },
      doneAt: { type: Date },
    }],

    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    assignedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['assigned', 'accepted', 'declined'], default: 'assigned' },
  },
  { timestamps: true }
);

workshopAssignmentSchema.index({ workshop: 1, editor: 1 }, { unique: true });
workshopAssignmentSchema.index({ editor: 1 });

module.exports = mongoose.model('WorkshopAssignment', workshopAssignmentSchema);
module.exports.CHECKLIST_DEFAULTS = CHECKLIST_DEFAULTS;
