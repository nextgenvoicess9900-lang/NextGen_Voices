const mongoose = require('mongoose');

/**
 * Assessment — exactly one per Workshop (enforced by the unique index
 * below), never shared between workshops. Eligibility to attempt it is
 * NOT a field on this document — it's computed at attempt-time in
 * attemptController from Registration + Attendance, so it can never be
 * accidentally loosened by editing assessment settings.
 */
const assessmentSchema = new mongoose.Schema(
  {
    workshop: { type: mongoose.Schema.Types.ObjectId, ref: 'Workshop', required: true, unique: true },
    title: { type: String, trim: true, required: true, maxlength: 150 },
    description: { type: String, trim: true, maxlength: 1000 },

    duration: { type: Number, default: 30 }, // minutes
    passPercentage: { type: Number, default: 60, min: 0, max: 100 },
    attemptsAllowed: { type: Number, default: 1, min: 1 },

    shuffleQuestions: { type: Boolean, default: true },
    shuffleOptions: { type: Boolean, default: true },
    negativeMarking: { type: Boolean, default: false },
    negativeMarkValue: { type: Number, default: 0 }, // marks deducted per wrong answer, if negativeMarking is on

    showResultsImmediately: { type: Boolean, default: true },
    enableReview: { type: Boolean, default: true },
    timerWarnings: { type: [Number], default: [15, 5, 1] }, // minutes remaining

    security: {
      disableCopy: { type: Boolean, default: true },
      disableRightClick: { type: Boolean, default: true },
      detectTabSwitch: { type: Boolean, default: true },
      detectBlur: { type: Boolean, default: true },
      fullscreenRequired: { type: Boolean, default: false },
      autoSubmitAfterViolations: { type: Number, default: 0 }, // 0 = disabled
    },

    availableFrom: { type: Date },
    deadline: { type: Date },

    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Assessment', assessmentSchema);
