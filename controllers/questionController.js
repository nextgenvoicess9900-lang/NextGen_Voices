const Question = require('../models/Question');
const asyncHandler = require('../utils/asyncHandler');
const logActivity = require('../utils/logActivity');
const { sanitizePlainText, sanitizeRichText } = require('../utils/sanitizeContent');

/** POST /api/questions — public, anonymous, rate-limited (see routes). */
const submitQuestion = asyncHandler(async (req, res) => {
  const { question, askerName, askerEmail } = req.body;
  const doc = await Question.create({
    question: sanitizePlainText(question),
    askerName: askerName ? sanitizePlainText(askerName) : 'Anonymous',
    askerEmail: askerEmail ? sanitizePlainText(askerEmail) : undefined,
    submittedIp: req.ip,
  });
  res.status(201).json({ message: 'Question submitted.', id: doc._id });
});

/** GET /api/questions — Admin/Editor. */
const listQuestions = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = status ? { status } : {};
  const questions = await Question.find(filter).sort('-createdAt');
  res.json(questions);
});

/** POST /api/questions/:id/answer — Admin/Editor. */
const answerQuestion = asyncHandler(async (req, res) => {
  const { text } = req.body;
  const question = await Question.findById(req.params.id);
  if (!question) return res.status(404).json({ error: 'Question not found.' });

  question.answer = {
    text: sanitizeRichText(text),
    answeredBy: req.user.id,
    answeredByRole: req.user.role === 'admin' ? 'Admin' : 'Editor',
    answeredAt: new Date(),
  };
  question.status = 'answered';
  await question.save();

  await logActivity({
    actor: { id: req.user.id, role: req.user.role === 'admin' ? 'Admin' : 'Editor', name: req.user.name, action: 'question.answered', targetType: 'Question', targetId: question._id },
    message: `Answered a viewer question.`,
  });

  res.json(question);
});

/** PUT /api/questions/:id/status — Admin/Editor. e.g. archive. */
const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['pending', 'answered', 'archived'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  const question = await Question.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!question) return res.status(404).json({ error: 'Question not found.' });
  res.json(question);
});

/** DELETE /api/questions/:id — Admin only. */
const deleteQuestion = asyncHandler(async (req, res) => {
  const question = await Question.findById(req.params.id);
  if (!question) return res.status(404).json({ error: 'Question not found.' });
  await question.deleteOne();

  await logActivity({
    actor: { id: req.user.id, role: 'Admin', name: req.user.name, action: 'question.deleted', targetType: 'Question', targetId: req.params.id },
    message: `Deleted a viewer question.`,
  });

  res.json({ message: 'Question deleted.' });
});

module.exports = { submitQuestion, listQuestions, answerQuestion, updateStatus, deleteQuestion };
