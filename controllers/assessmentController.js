const Assessment = require('../models/Assessment');
const AssessmentQuestion = require('../models/AssessmentQuestion');
const Workshop = require('../models/Workshop');
const asyncHandler = require('../utils/asyncHandler');
const { sanitizePlainText } = require('../utils/sanitizeContent');

/**
 * GET /api/workshops/:workshopId/assessment — Admin only. Creates a draft
 * Assessment on first access if this workshop doesn't have one yet, since
 * exactly one always exists per workshop once anyone starts configuring it.
 */
const getOrCreateAssessment = asyncHandler(async (req, res) => {
  const workshop = await Workshop.findById(req.params.workshopId);
  if (!workshop) return res.status(404).json({ error: 'Workshop not found.' });

  let assessment = await Assessment.findOne({ workshop: workshop._id });
  if (!assessment) {
    assessment = await Assessment.create({
      workshop: workshop._id,
      title: `${workshop.title} Assessment`,
      createdBy: req.user.id,
    });
  }
  const questions = await AssessmentQuestion.find({ assessment: assessment._id }).sort({ order: 1 });
  res.json({ assessment, questions });
});

/** PUT /api/assessments/:id — Admin only. */
const updateAssessment = asyncHandler(async (req, res) => {
  const assessment = await Assessment.findById(req.params.id);
  if (!assessment) return res.status(404).json({ error: 'Assessment not found.' });

  const b = req.body;
  if (b.title !== undefined) assessment.title = sanitizePlainText(b.title).slice(0, 150);
  if (b.description !== undefined) assessment.description = sanitizePlainText(b.description).slice(0, 1000);
  ['duration', 'passPercentage', 'attemptsAllowed', 'shuffleQuestions', 'shuffleOptions',
    'negativeMarking', 'negativeMarkValue', 'showResultsImmediately', 'enableReview',
    'timerWarnings', 'security', 'availableFrom', 'deadline'].forEach((field) => {
    if (b[field] !== undefined) assessment[field] = b[field];
  });
  await assessment.save();
  res.json(assessment);
});

/** POST /api/assessments/:id/publish — Admin only. Requires at least one question. */
const publishAssessment = asyncHandler(async (req, res) => {
  const assessment = await Assessment.findById(req.params.id);
  if (!assessment) return res.status(404).json({ error: 'Assessment not found.' });
  const count = await AssessmentQuestion.countDocuments({ assessment: assessment._id });
  if (count === 0) return res.status(400).json({ error: 'Add at least one question before publishing.' });
  assessment.status = 'published';
  await assessment.save();
  res.json(assessment);
});
/** POST /api/assessments/:id/unpublish — Admin only. */
const unpublishAssessment = asyncHandler(async (req, res) => {
  const assessment = await Assessment.findByIdAndUpdate(req.params.id, { status: 'draft' }, { new: true });
  if (!assessment) return res.status(404).json({ error: 'Assessment not found.' });
  res.json(assessment);
});

/** ---- Questions ---- */

const buildQuestionPayload = (b) => ({
  type: b.type,
  title: sanitizePlainText(b.title || ''),
  description: sanitizePlainText(b.description || ''),
  image: b.image || '',
  options: Array.isArray(b.options) ? b.options.map((o) => ({ text: sanitizePlainText(o.text || ''), isCorrect: !!o.isCorrect })) : [],
  numericalAnswer: b.numericalAnswer,
  referenceAnswer: sanitizePlainText(b.referenceAnswer || ''),
  marks: b.marks != null ? Number(b.marks) : 5,
  negativeMarks: b.negativeMarks != null ? Number(b.negativeMarks) : 0,
  required: b.required !== false,
  explanation: sanitizePlainText(b.explanation || ''),
  difficulty: b.difficulty || 'medium',
  topic: sanitizePlainText(b.topic || ''),
  tags: Array.isArray(b.tags) ? b.tags.map(sanitizePlainText).filter(Boolean) : [],
});

/** POST /api/assessments/:id/questions — Admin only. */
const createQuestion = asyncHandler(async (req, res) => {
  const assessment = await Assessment.findById(req.params.id);
  if (!assessment) return res.status(404).json({ error: 'Assessment not found.' });
  if (!req.body.title || !req.body.title.trim()) return res.status(400).json({ error: 'Question title is required.' });

  const count = await AssessmentQuestion.countDocuments({ assessment: assessment._id });
  const question = await AssessmentQuestion.create({ ...buildQuestionPayload(req.body), assessment: assessment._id, order: count });
  res.status(201).json(question);
});

/** PUT /api/questions/:id — Admin only. */
const updateQuestion = asyncHandler(async (req, res) => {
  const question = await AssessmentQuestion.findByIdAndUpdate(req.params.id, buildQuestionPayload(req.body), { new: true });
  if (!question) return res.status(404).json({ error: 'Question not found.' });
  res.json(question);
});

/** DELETE /api/questions/:id — Admin only. */
const deleteQuestion = asyncHandler(async (req, res) => {
  const question = await AssessmentQuestion.findByIdAndDelete(req.params.id);
  if (!question) return res.status(404).json({ error: 'Question not found.' });
  res.json({ success: true });
});

module.exports = {
  getOrCreateAssessment, updateAssessment, publishAssessment, unpublishAssessment,
  createQuestion, updateQuestion, deleteQuestion,
};
