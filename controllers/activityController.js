const ActivityLog = require('../models/ActivityLog');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/activity — Admin only. Recent audit trail, newest first. */
const listActivity = asyncHandler(async (req, res) => {
  const { limit = 50 } = req.query;
  const entries = await ActivityLog.find().sort('-createdAt').limit(Number(limit));
  res.json(entries);
});

module.exports = { listActivity };
