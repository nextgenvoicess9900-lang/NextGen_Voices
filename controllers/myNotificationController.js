const UserNotification = require('../models/UserNotification');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/my-notifications — Viewer only. */
const listMine = asyncHandler(async (req, res) => {
  const notifications = await UserNotification.find({ recipient: req.user.id })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('workshop', 'title bannerImage');
  const unreadCount = await UserNotification.countDocuments({ recipient: req.user.id, read: false });
  res.json({ notifications, unreadCount });
});

/** POST /api/my-notifications/:id/read — Viewer only, own notification. */
const markRead = asyncHandler(async (req, res) => {
  const n = await UserNotification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user.id },
    { read: true },
    { new: true }
  );
  if (!n) return res.status(404).json({ error: 'Notification not found.' });
  res.json(n);
});

/** POST /api/my-notifications/read-all — Viewer only. */
const markAllRead = asyncHandler(async (req, res) => {
  await UserNotification.updateMany({ recipient: req.user.id, read: false }, { read: true });
  res.json({ success: true });
});

module.exports = { listMine, markRead, markAllRead };
