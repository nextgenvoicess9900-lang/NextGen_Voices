const mongoose = require('mongoose');

/**
 * Question — submitted anonymously by any visitor (no login required).
 * `askerName`/`askerEmail` are optional so true anonymity is possible;
 * when present they are only ever visible to Admin/Editor, never public.
 */
const answerSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    answeredBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'answeredByRole' },
    answeredByRole: { type: String, enum: ['Admin', 'Editor'] },
    answeredAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true, maxlength: 1000 },
    askerName: { type: String, trim: true, default: 'Anonymous' },
    askerEmail: { type: String, trim: true },
    status: { type: String, enum: ['pending', 'answered', 'archived'], default: 'pending' },
    answer: answerSchema,
    // Captured for abuse mitigation only — never exposed via the public API.
    submittedIp: { type: String, select: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Question', questionSchema);
