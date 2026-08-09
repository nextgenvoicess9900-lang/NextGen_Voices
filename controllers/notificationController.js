const Notification = require('../models/Notification');
const Viewer = require('../models/Viewer');
const asyncHandler = require('../utils/asyncHandler');
const logActivity = require('../utils/logActivity');
const { sanitizePlainText } = require('../utils/sanitizeContent');
const { sendNotificationEmail } = require('../utils/mailer');

/**
 * GET /api/notifications — public. Only notifications that are published,
 * whose scheduledFor has already passed, and that have not expired.
 * Pinned notifications sort first, then newest first.
 */
const listPublic = asyncHandler(async (req, res) => {
  const now = new Date();
  const notifications = await Notification.find({
    published: true,
    scheduledFor: { $lte: now },
    $or: [{ expiryDate: null }, { expiryDate: { $gte: now } }],
  }).sort({ pinned: -1, urgent: -1, createdAt: -1 });
  res.json(notifications);
});

/** GET /api/notifications/all — Admin/Editor, includes unpublished/expired/future-scheduled. */
const listAll = asyncHandler(async (req, res) => {
  const notifications = await Notification.find().sort({ pinned: -1, createdAt: -1 });
  res.json(notifications);
});

/** POST /api/notifications — Admin only. */
const createNotification = asyncHandler(async (req, res) => {
  const { title, message, category = 'announcement', priority = 'medium', link, pinned, urgent, scheduledFor, expiryDate } = req.body;
  const notification = await Notification.create({
    title: sanitizePlainText(title),
    message: sanitizePlainText(message),
    category,
    priority,
    link: link ? sanitizePlainText(link) : undefined,
    pinned: !!pinned,
    urgent: !!urgent,
    scheduledFor: scheduledFor || undefined,
    expiryDate: expiryDate || undefined,
    createdBy: req.user.id,
  });

  await logActivity({
    actor: { id: req.user.id, role: 'Admin', name: req.user.name, action: 'notification.created', targetType: 'Notification', targetId: notification._id },
    message: `Created notification "${notification.title}".`,
  });

  // Fire-and-forget: don't make the admin wait on the mail server, and
  // don't email people about a notification that's scheduled for later.
  const dueNow = !notification.scheduledFor || notification.scheduledFor <= new Date();
  if (dueNow) {
    Viewer.find({ emailNotifications: true }).select('email').then(viewers => {
      sendNotificationEmail({ title: notification.title, message: notification.message }, viewers.map(v => v.email));
    }).catch(err => console.error('[notification] email dispatch failed:', err.message));
  }

  res.status(201).json(notification);
});

/** PUT /api/notifications/:id — Admin only. Edit any field, including pin/urgent/schedule. */
const updateNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);
  if (!notification) return res.status(404).json({ error: 'Notification not found.' });

  const { title, message, category, priority, link, pinned, urgent, scheduledFor, expiryDate, published } = req.body;
  if (title !== undefined) notification.title = sanitizePlainText(title);
  if (message !== undefined) notification.message = sanitizePlainText(message);
  if (category !== undefined) notification.category = category;
  if (priority !== undefined) notification.priority = priority;
  if (link !== undefined) notification.link = sanitizePlainText(link);
  if (pinned !== undefined) notification.pinned = !!pinned;
  if (urgent !== undefined) notification.urgent = !!urgent;
  if (scheduledFor !== undefined) notification.scheduledFor = scheduledFor || undefined;
  if (expiryDate !== undefined) notification.expiryDate = expiryDate || undefined;
  if (published !== undefined) notification.published = !!published;

  await notification.save();

  await logActivity({
    actor: { id: req.user.id, role: 'Admin', name: req.user.name, action: 'notification.updated', targetType: 'Notification', targetId: notification._id },
    message: `Updated notification "${notification.title}".`,
  });

  res.json(notification);
});

/** DELETE /api/notifications/:id — Admin only. */
const deleteNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);
  if (!notification) return res.status(404).json({ error: 'Notification not found.' });
  await notification.deleteOne();

  await logActivity({
    actor: { id: req.user.id, role: 'Admin', name: req.user.name, action: 'notification.deleted', targetType: 'Notification', targetId: req.params.id },
    message: `Deleted notification "${notification.title}".`,
  });

  res.json({ message: 'Notification deleted.' });
});

module.exports = { listPublic, listAll, createNotification, updateNotification, deleteNotification };
