const Feedback = require('../models/Feedback');
const Registration = require('../models/Registration');
const Attendance = require('../models/Attendance');
const asyncHandler = require('../utils/asyncHandler');
const { sanitizePlainText } = require('../utils/sanitizeContent');

/** POST /api/workshops/:id/feedback — Viewer only, must have attended. Upserts. */
const submitFeedback = asyncHandler(async (req, res) => {
  const registration = await Registration.findOne({ workshop: req.params.id, viewer: req.user.id, status: 'registered' });
  if (!registration) return res.status(403).json({ error: 'Only registered participants can leave feedback.' });
  const attendance = await Attendance.findOne({ registration: registration._id });
  if (!attendance || attendance.status === 'absent') {
    return res.status(403).json({ error: 'Only participants who attended can leave feedback.' });
  }

  const b = req.body;
  if (!b.ratings || !b.ratings.overall) return res.status(400).json({ error: 'An overall rating is required.' });

  const feedback = await Feedback.findOneAndUpdate(
    { workshop: req.params.id, viewer: req.user.id },
    {
      ratings: b.ratings,
      suggestion: sanitizePlainText(b.suggestion || '').slice(0, 1000),
      recommend: !!b.recommend,
      anonymous: !!b.anonymous,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.status(201).json(feedback);
});

/** GET /api/workshops/:id/feedback/mine — Viewer only. */
const getMyFeedback = asyncHandler(async (req, res) => {
  const feedback = await Feedback.findOne({ workshop: req.params.id, viewer: req.user.id });
  res.json({ feedback });
});

/** GET /api/workshops/:id/feedback — Admin only. Aggregated summary + responses. */
const getWorkshopFeedbackSummary = asyncHandler(async (req, res) => {
  const all = await Feedback.find({ workshop: req.params.id }).populate('viewer', 'fullName');
  const dims = ['content', 'speaker', 'presentation', 'interaction', 'resources', 'assessment', 'overall'];
  const avg = {};
  dims.forEach((d) => {
    const values = all.map((f) => f.ratings?.[d]).filter((v) => typeof v === 'number');
    avg[d] = values.length ? +(values.reduce((s, v) => s + v, 0) / values.length).toFixed(2) : null;
  });
  const recommendCount = all.filter((f) => f.recommend).length;

  res.json({
    totalResponses: all.length,
    averages: avg,
    recommendationRate: all.length ? Math.round((recommendCount / all.length) * 100) : 0,
    responses: all.map((f) => ({
      studentName: f.anonymous ? 'Anonymous' : (f.viewer?.fullName || 'Unknown'),
      ratings: f.ratings,
      suggestion: f.suggestion,
      recommend: f.recommend,
      createdAt: f.createdAt,
    })),
  });
});

module.exports = { submitFeedback, getMyFeedback, getWorkshopFeedbackSummary };
