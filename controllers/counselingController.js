const CounselingSlot = require('../models/CounselingSlot');
const asyncHandler = require('../utils/asyncHandler');
const logActivity = require('../utils/logActivity');
const { sanitizePlainText } = require('../utils/sanitizeContent');
const { sendTransactionalEmail } = require('../utils/mailer');

/** GET /api/counseling/slots — public. Open, upcoming slots only (no viewer identity leaked). */
const listOpenSlots = asyncHandler(async (req, res) => {
  const slots = await CounselingSlot.find({ status: 'open', date: { $gte: new Date() } })
    .select('hostName topic date startTime endTime')
    .sort('date startTime');
  res.json(slots);
});

/** GET /api/counseling/slots/mine — Admin/Editor. Slots they created, including who booked them. */
const listMyHostedSlots = asyncHandler(async (req, res) => {
  const slots = await CounselingSlot.find({ host: req.user.id })
    .populate('bookedBy', 'fullName email')
    .sort('date startTime');
  res.json(slots);
});

/** POST /api/counseling/slots — Admin/Editor. Opens a new bookable slot. */
const createSlot = asyncHandler(async (req, res) => {
  const { topic, date, startTime, endTime, notes } = req.body;
  const slot = await CounselingSlot.create({
    host: req.user.id,
    hostRole: req.user.role === 'admin' ? 'Admin' : 'Editor',
    hostName: req.user.name,
    topic: sanitizePlainText(topic) || 'General Counseling',
    date,
    startTime,
    endTime,
    notes: sanitizePlainText(notes),
  });

  await logActivity({
    actor: { id: req.user.id, role: req.user.role === 'admin' ? 'Admin' : 'Editor', name: req.user.name, action: 'counseling.slot_created', targetType: 'CounselingSlot', targetId: slot._id },
    message: `Opened a counseling slot on ${new Date(date).toDateString()} at ${startTime}.`,
  });

  res.status(201).json(slot);
});

/** DELETE /api/counseling/slots/:id — Admin/Editor (only the host), cancels an unbooked or booked slot. */
const cancelSlotAsHost = asyncHandler(async (req, res) => {
  const slot = await CounselingSlot.findById(req.params.id);
  if (!slot) return res.status(404).json({ error: 'Slot not found.' });
  if (req.user.role !== 'admin' && slot.host.toString() !== req.user.id) {
    return res.status(403).json({ error: 'You can only cancel slots you created.' });
  }
  slot.status = 'cancelled';
  await slot.save();
  res.json({ message: 'Slot cancelled.' });
});

/**
 * POST /api/counseling/slots/:id/book — Viewer only.
 * Atomic findOneAndUpdate so two viewers racing for the same slot can't
 * both succeed (the query only matches while status is still 'open').
 */
const bookSlot = asyncHandler(async (req, res) => {
  const { viewerNote } = req.body;
  const slot = await CounselingSlot.findOneAndUpdate(
    { _id: req.params.id, status: 'open' },
    { status: 'booked', bookedBy: req.user.id, bookedAt: new Date(), viewerNote: sanitizePlainText(viewerNote) },
    { new: true }
  );
  if (!slot) return res.status(409).json({ error: 'This slot is no longer available. Please choose another.' });

  await sendTransactionalEmail({
    to: req.user.email,
    subject: `Your counseling session is confirmed — ${new Date(slot.date).toDateString()}`,
    text: `Your one-on-one session with ${slot.hostName} is confirmed for ${new Date(slot.date).toDateString()} from ${slot.startTime} to ${slot.endTime}.`,
    html: `<p>Your one-on-one session with <b>${slot.hostName}</b> is confirmed for <b>${new Date(slot.date).toDateString()}</b>, ${slot.startTime}–${slot.endTime}.</p>`,
  });

  res.json(slot);
});

/** GET /api/counseling/bookings/mine — Viewer only. */
const listMyBookings = asyncHandler(async (req, res) => {
  const bookings = await CounselingSlot.find({ bookedBy: req.user.id, status: 'booked' }).sort('date startTime');
  res.json(bookings);
});

/** POST /api/counseling/slots/:id/cancel-booking — Viewer only, must be their own booking. */
const cancelMyBooking = asyncHandler(async (req, res) => {
  const slot = await CounselingSlot.findById(req.params.id);
  if (!slot || slot.bookedBy?.toString() !== req.user.id) {
    return res.status(404).json({ error: 'Booking not found.' });
  }
  slot.status = 'open';
  slot.bookedBy = undefined;
  slot.bookedAt = undefined;
  slot.viewerNote = undefined;
  await slot.save();
  res.json({ message: 'Booking cancelled — the slot is open again for others.' });
});

module.exports = { listOpenSlots, listMyHostedSlots, createSlot, cancelSlotAsHost, bookSlot, listMyBookings, cancelMyBooking };
