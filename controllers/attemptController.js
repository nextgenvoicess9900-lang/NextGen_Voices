const Assessment = require('../models/Assessment');
const AssessmentQuestion = require('../models/AssessmentQuestion');
const AssessmentAttempt = require('../models/AssessmentAttempt');
const Registration = require('../models/Registration');
const Attendance = require('../models/Attendance');
const asyncHandler = require('../utils/asyncHandler');

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The non-negotiable eligibility rule (Chapter 4): registered AND attended
 * THAT workshop AND attendance verified AND the assessment is published.
 * This is the ONLY place that rule is evaluated — every other endpoint
 * below trusts that an AssessmentAttempt existing at all means this passed.
 */
async function checkEligibility(workshopId, viewerId) {
  const assessment = await Assessment.findOne({ workshop: workshopId, status: 'published' });
  if (!assessment) return { eligible: false, reason: 'This workshop does not have a published assessment yet.' };

  const registration = await Registration.findOne({ workshop: workshopId, viewer: viewerId, status: 'registered' });
  if (!registration) return { eligible: false, reason: 'Only participants who registered for this workshop can access its assessment.' };

  const attendance = await Attendance.findOne({ registration: registration._id });
  if (!attendance || attendance.status === 'absent') {
    return { eligible: false, reason: 'Only participants who attended this workshop can access its assessment.' };
  }

  return { eligible: true, assessment, registration };
}

/** GET /api/workshops/:workshopId/assessment/take — Viewer only. The eligibility gate + question set (answers stripped). */
const getAssessmentForAttempt = asyncHandler(async (req, res) => {
  const check = await checkEligibility(req.params.workshopId, req.user.id);
  if (!check.eligible) return res.status(403).json({ error: check.reason, locked: true });

  const { assessment } = check;
  const attemptCount = await AssessmentAttempt.countDocuments({ assessment: assessment._id, viewer: req.user.id });
  const inProgress = await AssessmentAttempt.findOne({ assessment: assessment._id, viewer: req.user.id, status: 'in-progress' });

  if (!inProgress && attemptCount >= assessment.attemptsAllowed) {
    return res.status(403).json({ error: `You have used all ${assessment.attemptsAllowed} allowed attempt(s) for this assessment.`, locked: true, attemptsExhausted: true });
  }

  const questions = await AssessmentQuestion.find({ assessment: assessment._id }).sort({ order: 1 });
  const safeQuestions = questions.map((q) => ({
    _id: q._id, type: q.type, title: q.title, description: q.description, image: q.image,
    options: (q.options || []).map((o) => ({ _id: o._id, text: o.text })), // isCorrect stripped
    marks: q.marks, required: q.required,
  }));

  res.json({
    assessment: { _id: assessment._id, title: assessment.title, description: assessment.description, duration: assessment.duration, timerWarnings: assessment.timerWarnings, security: assessment.security, shuffleQuestions: assessment.shuffleQuestions, shuffleOptions: assessment.shuffleOptions },
    questions: assessment.shuffleQuestions ? shuffle(safeQuestions) : safeQuestions,
    inProgressAttemptId: inProgress ? inProgress._id : null,
  });
});

/** POST /api/workshops/:workshopId/assessment/start — Viewer only. */
const startAttempt = asyncHandler(async (req, res) => {
  const check = await checkEligibility(req.params.workshopId, req.user.id);
  if (!check.eligible) return res.status(403).json({ error: check.reason, locked: true });

  const existing = await AssessmentAttempt.findOne({ assessment: check.assessment._id, viewer: req.user.id, status: 'in-progress' });
  if (existing) return res.json(existing);

  const attemptCount = await AssessmentAttempt.countDocuments({ assessment: check.assessment._id, viewer: req.user.id });
  if (attemptCount >= check.assessment.attemptsAllowed) return res.status(403).json({ error: 'No attempts remaining.', locked: true });

  const questions = await AssessmentQuestion.find({ assessment: check.assessment._id });
  const attempt = await AssessmentAttempt.create({
    assessment: check.assessment._id,
    workshop: req.params.workshopId,
    viewer: req.user.id,
    registration: check.registration._id,
    attemptNumber: attemptCount + 1,
    answers: questions.map((q) => ({ question: q._id, response: null })),
    maxScore: questions.reduce((sum, q) => sum + q.marks, 0),
  });
  res.status(201).json(attempt);
});

/** POST /api/attempts/:id/answer — Viewer only, own attempt. Autosave, no grading here. */
const saveAnswer = asyncHandler(async (req, res) => {
  const attempt = await AssessmentAttempt.findOne({ _id: req.params.id, viewer: req.user.id, status: 'in-progress' });
  if (!attempt) return res.status(404).json({ error: 'Attempt not found or already submitted.' });

  const { questionId, response, markedForReview } = req.body;
  const answer = attempt.answers.find((a) => a.question.toString() === questionId);
  if (!answer) return res.status(400).json({ error: 'Question does not belong to this attempt.' });
  answer.response = response;
  if (markedForReview !== undefined) answer.markedForReview = markedForReview;
  await attempt.save();
  res.json({ success: true });
});

/** POST /api/attempts/:id/violation — Viewer only, own attempt. Records anti-cheat events; never blocks the exam itself. */
const recordViolation = asyncHandler(async (req, res) => {
  const attempt = await AssessmentAttempt.findOne({ _id: req.params.id, viewer: req.user.id, status: 'in-progress' });
  if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
  attempt.violations.push({ type: req.body.type || 'unknown' });
  await attempt.save();
  res.json({ violationCount: attempt.violations.length });
});

/**
 * POST /api/attempts/:id/submit — Viewer only, own attempt.
 * Auto-grades every auto-gradable answer immediately; short-answer
 * questions are flagged needsManualGrading and contribute 0 until a
 * grader scores them (score/percentage recompute in manualGrade below).
 */
const submitAttempt = asyncHandler(async (req, res) => {
  const attempt = await AssessmentAttempt.findOne({ _id: req.params.id, viewer: req.user.id, status: 'in-progress' });
  if (!attempt) return res.status(404).json({ error: 'Attempt not found or already submitted.' });

  const assessment = await Assessment.findById(attempt.assessment);
  const questions = await AssessmentQuestion.find({ assessment: attempt.assessment });
  const qMap = new Map(questions.map((q) => [q._id.toString(), q]));

  let score = 0;
  attempt.answers.forEach((answer) => {
    const q = qMap.get(answer.question.toString());
    if (!q) return;
    if (q.type === 'short') {
      answer.needsManualGrading = answer.response != null && String(answer.response).trim() !== '';
      answer.autoGraded = false;
      return;
    }
    answer.autoGraded = true;
    let correct = false;
    if (q.type === 'single' || q.type === 'trueFalse') {
      const correctOption = q.options.find((o) => o.isCorrect);
      correct = correctOption && answer.response === correctOption._id.toString();
    } else if (q.type === 'multi') {
      const correctIds = q.options.filter((o) => o.isCorrect).map((o) => o._id.toString()).sort();
      const given = Array.isArray(answer.response) ? [...answer.response].sort() : [];
      correct = correctIds.length === given.length && correctIds.every((id, i) => id === given[i]);
    } else if (q.type === 'numerical') {
      const tol = q.numericalAnswer?.tolerance || 0;
      correct = typeof answer.response === 'number' && q.numericalAnswer && Math.abs(answer.response - q.numericalAnswer.value) <= tol;
    }
    if (correct) {
      answer.marksAwarded = q.marks;
      score += q.marks;
    } else if (assessment.negativeMarking && answer.response != null) {
      answer.marksAwarded = -(q.negativeMarks || assessment.negativeMarkValue || 0);
      score += answer.marksAwarded;
    } else {
      answer.marksAwarded = 0;
    }
  });

  const hasManualPending = attempt.answers.some((a) => a.needsManualGrading);
  attempt.score = Math.max(0, score);
  attempt.percentage = attempt.maxScore ? Math.round((attempt.score / attempt.maxScore) * 100) : 0;
  attempt.passFail = hasManualPending ? 'pending' : (attempt.percentage >= assessment.passPercentage ? 'pass' : 'fail');
  attempt.status = req.body.auto ? 'auto-submitted' : 'submitted';
  attempt.submittedAt = new Date();
  attempt.timeTakenSeconds = Math.round((attempt.submittedAt - attempt.startedAt) / 1000);
  attempt.resultsPublished = assessment.showResultsImmediately && !hasManualPending;
  await attempt.save();

  res.json(attempt);
});

/** GET /api/workshops/:workshopId/assessment/my-result — Viewer only. Latest attempt for this workshop. */
const getMyResult = asyncHandler(async (req, res) => {
  const assessment = await Assessment.findOne({ workshop: req.params.workshopId });
  if (!assessment) return res.status(404).json({ error: 'No assessment for this workshop.' });
  const attempt = await AssessmentAttempt.findOne({ assessment: assessment._id, viewer: req.user.id, status: { $ne: 'in-progress' } }).sort({ submittedAt: -1 });
  if (!attempt) return res.status(404).json({ error: 'No submitted attempt found.' });

  const questions = await AssessmentQuestion.find({ assessment: assessment._id });
  const qMap = new Map(questions.map((q) => [q._id.toString(), q]));
  const correct = attempt.answers.filter((a) => qMap.get(a.question.toString())?.type !== 'short' && a.marksAwarded > 0).length;
  const incorrect = attempt.answers.filter((a) => qMap.get(a.question.toString())?.type !== 'short' && a.autoGraded && a.marksAwarded <= 0 && a.response != null).length;
  const skipped = attempt.answers.filter((a) => a.response == null).length;

  res.json({
    attempt: attempt.resultsPublished ? attempt : { ...attempt.toObject(), score: null, percentage: null, passFail: 'pending' },
    resultsPublished: attempt.resultsPublished,
    correct, incorrect, skipped,
    assessmentTitle: assessment.title,
    certificateAvailableIfPass: true,
  });
});

/** GET /api/assessments/:id/responses — Admin only. Powers the Responses table. */
const listResponses = asyncHandler(async (req, res) => {
  const attempts = await AssessmentAttempt.find({ assessment: req.params.id, status: { $ne: 'in-progress' } })
    .populate('viewer', 'fullName email institution')
    .sort({ submittedAt: -1 });
  res.json({ attempts });
});

/** GET /api/attempts/:id — Admin only. Full paper review. */
const getAttemptDetail = asyncHandler(async (req, res) => {
  const attempt = await AssessmentAttempt.findById(req.params.id).populate('viewer', 'fullName email institution');
  if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
  const questions = await AssessmentQuestion.find({ assessment: attempt.assessment });
  res.json({ attempt, questions });
});

/** POST /api/attempts/:id/grade — Admin only. Manual grading for short-answer questions; recomputes the attempt totals. */
const manualGrade = asyncHandler(async (req, res) => {
  const attempt = await AssessmentAttempt.findById(req.params.id);
  if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
  const { questionId, marksAwarded, feedback } = req.body;
  const answer = attempt.answers.find((a) => a.question.toString() === questionId);
  if (!answer) return res.status(404).json({ error: 'Question not found on this attempt.' });

  answer.marksAwarded = Number(marksAwarded) || 0;
  answer.needsManualGrading = false;
  answer.graderFeedback = feedback || '';

  const assessment = await Assessment.findById(attempt.assessment);
  attempt.score = Math.max(0, attempt.answers.reduce((sum, a) => sum + (a.marksAwarded || 0), 0));
  attempt.percentage = attempt.maxScore ? Math.round((attempt.score / attempt.maxScore) * 100) : 0;
  const stillPending = attempt.answers.some((a) => a.needsManualGrading);
  attempt.passFail = stillPending ? 'pending' : (attempt.percentage >= assessment.passPercentage ? 'pass' : 'fail');
  if (!stillPending) attempt.resultsPublished = true;
  await attempt.save();
  res.json(attempt);
});

module.exports = {
  getAssessmentForAttempt, startAttempt, saveAnswer, recordViolation, submitAttempt,
  getMyResult, listResponses, getAttemptDetail, manualGrade,
};
