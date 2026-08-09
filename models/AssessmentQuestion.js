const mongoose = require('mongoose');

/**
 * AssessmentQuestion — named distinctly from the existing `Question` model
 * (that one is NEXTGEN's anonymous public Q&A feature, unrelated to
 * workshop assessments — do not confuse the two).
 *
 * Question types shipped in this phase. Image/video/file-upload/code-
 * snippet/matching/ordering/fill-in-the-blank questions are deferred to a
 * later pass — see workshop-module-plan.md §5 Phase 5 note. These five
 * cover the highest-value case (auto-grading) plus one manually-graded
 * type (short answer) so the manual-grading queue has something real to
 * operate on.
 */
const QUESTION_TYPES = ['single', 'multi', 'trueFalse', 'short', 'numerical'];
const AUTO_GRADABLE_TYPES = ['single', 'multi', 'trueFalse', 'numerical'];

const optionSchema = new mongoose.Schema(
  { text: { type: String, trim: true }, isCorrect: { type: Boolean, default: false } },
  { _id: true }
);

const assessmentQuestionSchema = new mongoose.Schema(
  {
    assessment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', required: true },
    type: { type: String, enum: QUESTION_TYPES, required: true, default: 'single' },
    title: { type: String, trim: true, required: true },
    description: { type: String, trim: true },
    image: { type: String, trim: true },

    options: [optionSchema], // used by single / multi / trueFalse
    numericalAnswer: { value: Number, tolerance: { type: Number, default: 0 } }, // used by numerical
    referenceAnswer: { type: String, trim: true }, // used by short — shown to the grader, not auto-compared

    marks: { type: Number, default: 5, min: 0 },
    negativeMarks: { type: Number, default: 0, min: 0 },
    required: { type: Boolean, default: true },
    explanation: { type: String, trim: true }, // shown after submission if enableReview

    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    topic: { type: String, trim: true },
    tags: [{ type: String, trim: true }],

    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

assessmentQuestionSchema.index({ assessment: 1, order: 1 });

module.exports = mongoose.model('AssessmentQuestion', assessmentQuestionSchema);
module.exports.QUESTION_TYPES = QUESTION_TYPES;
module.exports.AUTO_GRADABLE_TYPES = AUTO_GRADABLE_TYPES;
