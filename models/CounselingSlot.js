const mongoose = require('mongoose');

/**
 * CounselingSlot — a one-on-one time slot offered by an Admin or Editor.
 * Viewers browse open slots and book one; once booked a slot cannot be
 * double-booked (enforced by the unique status transition in the
 * controller, not just client-side).
 */
const counselingSlotSchema = new mongoose.Schema(
  {
    host: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'hostRole' },
    hostRole: { type: String, enum: ['Admin', 'Editor'], required: true },
    hostName: { type: String, required: true },
    topic: { type: String, trim: true, default: 'General Counseling' },
    date: { type: Date, required: true },
    startTime: { type: String, required: true }, // "14:00"
    endTime: { type: String, required: true },   // "14:30"
    notes: { type: String, trim: true },
    status: { type: String, enum: ['open', 'booked', 'cancelled'], default: 'open' },
    bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Viewer' },
    bookedAt: { type: Date },
    viewerNote: { type: String, trim: true }, // what the student wants to discuss
  },
  { timestamps: true }
);

module.exports = mongoose.model('CounselingSlot', counselingSlotSchema);
