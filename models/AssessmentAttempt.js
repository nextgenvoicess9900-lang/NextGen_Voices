const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema(
  {
    question: { type: mongoose.Schema.Types.ObjectId, ref: 'AssessmentQuestion', required: true },
    // Shape depends on question type: [optionId] for single/trueFalse,
    // [optionId,...] for multi, Number for numerical, String for short.
    response: { type: mongoose.Schema.Types.Mixed },
    marksAwarded: { type: Number, default: 0 },
    autoGraded: { type: Boolean, default: false },
    needsManualGrading: { type: Boolean, default: false },
    graderFeedback: { type: String, trim: true },
    markedForReview: { type: Boolean, default: false },
  },
  { _id: false }
);

/**
 * AssessmentAttempt — one student's attempt at one workshop's assessment.
 * Eligibility (registered + attended THAT workshop) is checked before this
 * is ever created — see attemptController.getAssessmentForAttempt — so a
 * document existing here already implies the student was allowed to be here.
 */
const assessmentAttemptSchema = new mongoose.Schema(
  {
    assessment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', required: true },
    workshop: { type: mongoose.Schema.Types.ObjectId, ref: 'Workshop', required: true },
    viewer: { type: mongoose.Schema.Types.ObjectId, ref: 'Viewer', required: true },
    registration: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration', required: true },
    attemptNumber: { type: Number, default: 1 },

    answers: [answerSchema],
    questionOrder: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AssessmentQuestion' }], // this attempt's shuffled order, if shuffleQuestions was on

    startedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date },
    timeTakenSeconds: { type: Number },

    score: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    passFail: { type: String, enum: ['pending', 'pass', 'fail'], default: 'pending' },

    violations: [{ type: { type: String, trim: true }, at: { type: Date, default: Date.now } }],
    status: { type: String, enum: ['in-progress', 'submitted', 'auto-submitted'], default: 'in-progress' },

    resultsPublished: { type: Boolean, default: false }, // gates whether the student can see marksAwarded/percentage yet
  },
  { timestamps: true }
);

assessmentAttemptSchema.index({ assessment: 1, viewer: 1 });

module.exports = mongoose.model('AssessmentAttempt', assessmentAttemptSchema);
