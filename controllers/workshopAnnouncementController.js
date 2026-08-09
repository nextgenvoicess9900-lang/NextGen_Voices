const Workshop = require('../models/Workshop');
const WorkshopAnnouncement = require('../models/WorkshopAnnouncement');
const Registration = require('../models/Registration');
const Attendance = require('../models/Attendance');
const UserNotification = require('../models/UserNotification');
const asyncHandler = require('../utils/asyncHandler');
const { sanitizePlainText } = require('../utils/sanitizeContent');
const logActivity = require('../utils/logActivity');

/** GET /api/workshops/:id/announcements — Admin only. */
const listWorkshopAnnouncements = asyncHandler(async (req, res) => {
  const announcements = await WorkshopAnnouncement.find({ workshop: req.params.id }).sort({ createdAt: -1 });
  res.json({ announcements });
});

/**
 * POST /api/workshops/:id/announcements — Admin only. Sends immediately —
 * "recipients" is computed for real from Registration/Attendance, and a
 * real UserNotification (website) is created for every one of them.
 * Email/SMS channels are recorded as *requested* but not delivered — see
 * workshop-module-plan.md §0.6.
 */
const sendWorkshopAnnouncement = asyncHandler(async (req, res) => {
  const workshop = await Workshop.findById(req.params.id);
  if (!workshop) return res.status(404).json({ error: 'Workshop not found.' });

  const { title, body, audience, channels } = req.body;
  if (!title || !title.trim() || !body || !body.trim()) {
    return res.status(400).json({ error: 'Title and message are required.' });
  }

  const registrations = await Registration.find({ workshop: workshop._id, status: 'registered' });
  let recipientViewerIds = registrations.map((r) => r.viewer);

  if (audience === 'attended') {
    const regIds = registrations.map((r) => r._id);
    const attendedRecords = await Attendance.find({ registration: { $in: regIds }, status: { $ne: 'absent' } });
    const attendedRegIds = new Set(attendedRecords.map((a) => a.registration.toString()));
    recipientViewerIds = registrations.filter((r) => attendedRegIds.has(r._id.toString())).map((r) => r.viewer);
  }

  await UserNotification.insertMany(
    recipientViewerIds.map((viewerId) => ({
      recipient: viewerId,
      workshop: workshop._id,
      type: 'announcement',
      title: sanitizePlainText(title).slice(0, 150),
      message: sanitizePlainText(body).slice(0, 2000),
      link: `#/ws/${workshop._id}`,
    }))
  );

  const announcement = await WorkshopAnnouncement.create({
    workshop: workshop._id,
    title: sanitizePlainText(title).slice(0, 150),
    body: sanitizePlainText(body).slice(0, 2000),
    audience: audience || 'registered',
    channels: Array.isArray(channels) && channels.length ? channels : ['website'],
    recipientCount: recipientViewerIds.length,
    createdBy: req.user.id,
  });

  await logActivity({
    actor: { id: req.user.id, role: 'Admin', name: req.user.name, action: 'workshop.announcement_sent', targetType: 'WorkshopAnnouncement', targetId: announcement._id },
    message: `Sent announcement "${announcement.title}" to ${recipientViewerIds.length} participant(s) of "${workshop.title}".`,
  });

  res.status(201).json(announcement);
});

module.exports = { listWorkshopAnnouncements, sendWorkshopAnnouncement };
