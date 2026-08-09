const Announcement = require('../models/Announcement');
const asyncHandler = require('../utils/asyncHandler');
const logActivity = require('../utils/logActivity');
const { sanitizePlainText, sanitizeRichText } = require('../utils/sanitizeContent');

/** GET /api/announcements — public, published only. */
const listPublic = asyncHandler(async (req, res) => {
  const announcements = await Announcement.find({ status: 'published', visibility: 'public' }).sort('-publishDate');
  res.json(announcements);
});

/** GET /api/announcements/all — Admin only. */
const listAll = asyncHandler(async (req, res) => {
  const announcements = await Announcement.find().sort('-createdAt');
  res.json(announcements);
});

/** POST /api/announcements — Admin only. Publishes immediately or schedules. */
const createAnnouncement = asyncHandler(async (req, res) => {
  const { title, description, bannerImage, category, visibility = 'public', scheduleDate } = req.body;

  const isScheduled = !!scheduleDate && new Date(scheduleDate) > new Date();
  const announcement = await Announcement.create({
    title: sanitizePlainText(title),
    description: sanitizeRichText(description),
    bannerImage,
    category: sanitizePlainText(category),
    visibility,
    scheduleDate: scheduleDate || undefined,
    publishDate: isScheduled ? undefined : new Date(),
    status: isScheduled ? 'scheduled' : 'published',
    createdBy: req.user.id,
  });

  await logActivity({
    actor: { id: req.user.id, role: 'Admin', name: req.user.name, action: 'announcement.created', targetType: 'Announcement', targetId: announcement._id },
    message: `${isScheduled ? 'Scheduled' : 'Published'} announcement "${announcement.title}".`,
  });

  res.status(201).json(announcement);
});

/** DELETE /api/announcements/:id — Admin only. */
const deleteAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id);
  if (!announcement) return res.status(404).json({ error: 'Announcement not found.' });
  await announcement.deleteOne();

  await logActivity({
    actor: { id: req.user.id, role: 'Admin', name: req.user.name, action: 'announcement.deleted', targetType: 'Announcement', targetId: req.params.id },
    message: `Deleted announcement "${announcement.title}".`,
  });

  res.json({ message: 'Announcement deleted.' });
});

module.exports = { listPublic, listAll, createAnnouncement, deleteAnnouncement };
