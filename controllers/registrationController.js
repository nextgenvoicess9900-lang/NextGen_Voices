const Workshop = require('../models/Workshop');
const Registration = require('../models/Registration');
const Attendance = require('../models/Attendance');
const UserNotification = require('../models/UserNotification');
const asyncHandler = require('../utils/asyncHandler');
const { sanitizePlainText } = require('../utils/sanitizeContent');

const REGISTRABLE_STATUSES = ['published', 'registrationOpen', 'upcoming', 'startsSoon'];

async function notify(viewerId, workshop, type, title, message) {
  await UserNotification.create({
    recipient: viewerId,
    workshop: workshop._id,
    type,
    title,
    message,
    link: `#/ws/${workshop._id}`,
  });
}

/**
 * POST /api/workshops/:id/register — Viewer only.
 * Real capacity + waiting-list logic: counts actual Registration documents
 * rather than trusting a cached number, so it can never drift out of sync.
 */
const registerForWorkshop = asyncHandler(async (req, res) => {
  const workshop = await Workshop.findById(req.params.id);
  if (!workshop) return res.status(404).json({ error: 'Workshop not found.' });
  if (!REGISTRABLE_STATUSES.includes(workshop.status)) {
    return res.status(400).json({ error: 'Registration is not open for this workshop.' });
  }

  const reg = workshop.registration || {};
  const now = new Date();
  if (reg.opensAt && now < new Date(reg.opensAt)) return res.status(400).json({ error: 'Registration has not opened yet.' });
  if (reg.closesAt && now > new Date(reg.closesAt)) return res.status(400).json({ error: 'Registration has closed.' });

  const existing = await Registration.findOne({ workshop: workshop._id, viewer: req.user.id, status: { $ne: 'cancelled' } });
  if (existing) return res.status(409).json({ error: 'You are already registered for this workshop.', status: existing.status });

  const registeredCount = await Registration.countDocuments({ workshop: workshop._id, status: 'registered' });
  const capacity = reg.maxParticipants || 100;
  let status = 'registered';

  if (registeredCount >= capacity) {
    if (!reg.waitingListEnabled) return res.status(400).json({ error: 'This workshop is full.' });
    const waitlistCount = await Registration.countDocuments({ workshop: workshop._id, status: 'waitlisted' });
    if (waitlistCount >= (reg.maxWaitingListSize || 50)) {
      return res.status(400).json({ error: 'This workshop and its waiting list are both full.' });
    }
    status = 'waitlisted';
  }

  const b = req.body || {};
  const registration = await Registration.create({
    workshop: workshop._id,
    viewer: req.user.id,
    status,
    additionalInfo: {
      institution: sanitizePlainText(b.institution || ''),
      department: sanitizePlainText(b.department || ''),
      year: sanitizePlainText(b.year || ''),
      phone: sanitizePlainText(b.phone || ''),
      country: sanitizePlainText(b.country || ''),
      customAnswers: Array.isArray(b.customAnswers) ? b.customAnswers : [],
    },
  });

  await notify(
    req.user.id, workshop,
    status === 'registered' ? 'registration-confirmed' : 'waitlisted',
    status === 'registered' ? 'Registration Confirmed 🎉' : 'Added to Waiting List',
    status === 'registered'
      ? `You're registered for "${workshop.title}". We'll remind you before it starts.`
      : `"${workshop.title}" is full — you're on the waiting list and will be notified if a spot opens up.`
  );

  // Registration automation (Chapter 6): a confirmed seat gets an
  // Attendance record immediately, defaulting to 'absent' until the
  // workshop actually happens — nothing downstream (assessment
  // eligibility, etc.) ever has to guess whether one exists.
  if (status === 'registered') {
    await Attendance.create({ workshop: workshop._id, registration: registration._id, viewer: req.user.id, status: 'absent' });
  }

  res.status(201).json({ registration, status });
});

/**
 * POST /api/workshops/:id/cancel — Viewer only, own registration.
 * If a confirmed seat opens up, automatically promotes the earliest
 * waitlisted registration and notifies that student — matches Chapter 6's
 * waiting-list automation.
 */
const cancelMyRegistration = asyncHandler(async (req, res) => {
  const registration = await Registration.findOne({ workshop: req.params.id, viewer: req.user.id, status: { $ne: 'cancelled' } });
  if (!registration) return res.status(404).json({ error: 'You do not have an active registration for this workshop.' });

  const wasConfirmedSeat = registration.status === 'registered';
  registration.status = 'cancelled';
  registration.cancelledAt = new Date();
  registration.cancellationReason = sanitizePlainText(req.body?.reason || '');
  await registration.save();

  if (wasConfirmedSeat) {
    const nextInLine = await Registration.findOne({ workshop: req.params.id, status: 'waitlisted' }).sort({ registeredAt: 1 });
    if (nextInLine) {
      nextInLine.status = 'registered';
      await nextInLine.save();
      await Attendance.create({ workshop: req.params.id, registration: nextInLine._id, viewer: nextInLine.viewer, status: 'absent' });
      const workshop = await Workshop.findById(req.params.id);
      await notify(nextInLine.viewer, workshop, 'waitlist-promoted', 'A Spot Opened Up! 🎉', `You've been moved off the waiting list and confirmed for "${workshop.title}".`);
    }
  }

  res.json({ success: true });
});

/** GET /api/workshops/:id/my-status — Viewer only. Powers the Register/Registered button state. */
const getMyRegistrationStatus = asyncHandler(async (req, res) => {
  const registration = await Registration.findOne({ workshop: req.params.id, viewer: req.user.id, status: { $ne: 'cancelled' } });
  res.json({ registered: !!registration, status: registration ? registration.status : null, registrationId: registration ? registration._id : null });
});

/** GET /api/registrations/mine — Viewer only. Powers "My Workshops". */
const listMyRegistrations = asyncHandler(async (req, res) => {
  const registrations = await Registration.find({ viewer: req.user.id, status: { $ne: 'cancelled' } })
    .populate('workshop')
    .sort({ registeredAt: -1 });
  res.json({ registrations });
});

/** GET /api/workshops/:id/registrations — Admin only. Powers the Registration Dashboard (Image 9). */
const listWorkshopRegistrations = asyncHandler(async (req, res) => {
  const registrations = await Registration.find({ workshop: req.params.id })
    .populate('viewer', 'fullName email institution profilePhoto')
    .sort({ registeredAt: -1 });
  const attendanceByReg = new Map(
    (await Attendance.find({ workshop: req.params.id })).map((a) => [a.registration.toString(), a])
  );
  res.json({
    registrations: registrations.map((r) => ({
      _id: r._id, viewer: r.viewer, status: r.status, registeredAt: r.registeredAt,
      additionalInfo: r.additionalInfo,
      attendanceStatus: attendanceByReg.get(r._id.toString())?.status || null,
    })),
    summary: {
      total: registrations.length,
      registered: registrations.filter((r) => r.status === 'registered').length,
      waitlisted: registrations.filter((r) => r.status === 'waitlisted').length,
      cancelled: registrations.filter((r) => r.status === 'cancelled').length,
    },
  });
});

module.exports = { registerForWorkshop, cancelMyRegistration, getMyRegistrationStatus, listMyRegistrations, listWorkshopRegistrations };
