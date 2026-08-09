const Workshop = require('../models/Workshop');
const Registration = require('../models/Registration');
const asyncHandler = require('../utils/asyncHandler');
const { sanitizePlainText, sanitizeRichText } = require('../utils/sanitizeContent');
const logActivity = require('../utils/logActivity');

/** Attaches a live registeredCount/seatsLeft to a workshop doc's JSON —
 *  computed from real Registration documents, never cached on the Workshop
 *  itself, so it can't drift out of sync. */
async function withRegistrationCounts(workshop) {
  const obj = workshop.toObject ? workshop.toObject() : workshop;
  const registeredCount = await Registration.countDocuments({ workshop: obj._id, status: 'registered' });
  const waitlistCount = await Registration.countDocuments({ workshop: obj._id, status: 'waitlisted' });
  const capacity = (obj.registration && obj.registration.maxParticipants) || 100;
  return { ...obj, registeredCount, waitlistCount, seatsLeft: Math.max(0, capacity - registeredCount) };
}

/** Statuses a non-admin (guest or viewer) is allowed to see at all. */
const PUBLIC_STATUSES = [
  'published', 'registrationOpen', 'registrationClosed',
  'upcoming', 'startsSoon', 'live', 'completed', 'archived',
];

/**
 * GET /api/workshops
 * Admins see every workshop regardless of status. Everyone else only sees
 * workshops that have actually been published — drafts and cancelled
 * workshops never leak into public listings.
 */
const listWorkshops = asyncHandler(async (req, res) => {
  const isAdmin = req.user && req.user.role === 'admin';
  const { status, category, search, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (isAdmin) {
    if (status) filter.status = status;
  } else {
    filter.status = status && PUBLIC_STATUSES.includes(status) ? status : { $in: PUBLIC_STATUSES };
    filter.visibility = 'public';
  }
  if (category) filter.category = category;
  if (search) filter.$text = { $search: search };

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));

  const [workshops, total] = await Promise.all([
    Workshop.find(filter)
      .sort({ 'schedule.date': 1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Workshop.countDocuments(filter),
  ]);
  const withCounts = await Promise.all(workshops.map(withRegistrationCounts));

  res.json({ workshops: withCounts, total, page: pageNum, pages: Math.ceil(total / limitNum) || 1 });
});

/** GET /api/workshops/:id — same visibility rule as the list. */
const getWorkshop = asyncHandler(async (req, res) => {
  const workshop = await Workshop.findById(req.params.id).populate('createdBy', 'name userId');
  if (!workshop) return res.status(404).json({ error: 'Workshop not found.' });

  const isAdmin = req.user && req.user.role === 'admin';
  if (!isAdmin && (!PUBLIC_STATUSES.includes(workshop.status) || workshop.visibility !== 'public')) {
    return res.status(404).json({ error: 'Workshop not found.' });
  }
  res.json(await withRegistrationCounts(workshop));
});

/**
 * POST /api/workshops — Admin only. Accepts the full Workshop shape so the
 * eventual multi-step wizard (Phase 2) has a stable target, but every field
 * beyond `title` is optional here — Phase 1 only needs a minimal record to
 * exist so the list view has something real to render.
 */
const createWorkshop = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.title || !b.title.trim()) {
    return res.status(400).json({ error: 'Workshop title is required.' });
  }

  const workshop = await Workshop.create({
    title: sanitizePlainText(b.title).slice(0, 150),
    subtitle: sanitizePlainText(b.subtitle || '').slice(0, 200),
    description: sanitizeRichText(b.description || ''),
    category: b.category,
    tags: Array.isArray(b.tags) ? b.tags.map(sanitizePlainText).filter(Boolean) : [],
    bannerImage: b.bannerImage || '',
    thumbnailImage: b.thumbnailImage || '',
    speaker: b.speaker,
    language: b.language ? sanitizePlainText(b.language) : undefined,
    difficulty: b.difficulty,
    durationMinutes: b.durationMinutes,
    type: b.type,
    learningOutcomes: Array.isArray(b.learningOutcomes) ? b.learningOutcomes.map(sanitizePlainText).filter(Boolean) : [],
    agenda: b.agenda,
    prerequisites: Array.isArray(b.prerequisites) ? b.prerequisites.map(sanitizePlainText).filter(Boolean) : [],
    skillsCovered: Array.isArray(b.skillsCovered) ? b.skillsCovered.map(sanitizePlainText).filter(Boolean) : [],
    certificateAvailable: b.certificateAvailable,
    visibility: b.visibility,
    status: 'draft', // always starts as draft — publishing is a deliberate separate action (Phase 2)
    schedule: b.schedule,
    meeting: b.meeting,
    volunteerReportingTime: b.volunteerReportingTime,
    registration: b.registration,
    createdBy: req.user.id,
  });

  res.status(201).json(workshop);
});

/** PUT /api/workshops/:id — Admin only. Same field set as create, all optional. */
const updateWorkshop = asyncHandler(async (req, res) => {
  const workshop = await Workshop.findById(req.params.id);
  if (!workshop) return res.status(404).json({ error: 'Workshop not found.' });

  const b = req.body;
  const textFields = { title: 150, subtitle: 200 };
  Object.entries(textFields).forEach(([field, max]) => {
    if (b[field] !== undefined) workshop[field] = sanitizePlainText(b[field]).slice(0, max);
  });
  if (b.description !== undefined) workshop.description = sanitizeRichText(b.description);
  if (b.tags !== undefined) workshop.tags = (b.tags || []).map(sanitizePlainText).filter(Boolean);
  if (b.learningOutcomes !== undefined) workshop.learningOutcomes = (b.learningOutcomes || []).map(sanitizePlainText).filter(Boolean);
  if (b.prerequisites !== undefined) workshop.prerequisites = (b.prerequisites || []).map(sanitizePlainText).filter(Boolean);
  if (b.skillsCovered !== undefined) workshop.skillsCovered = (b.skillsCovered || []).map(sanitizePlainText).filter(Boolean);

  const directFields = [
    'category', 'bannerImage', 'thumbnailImage', 'speaker', 'language', 'difficulty',
    'durationMinutes', 'type', 'agenda', 'certificateAvailable', 'visibility',
    'schedule', 'meeting', 'volunteerReportingTime', 'registration', 'scheduledPublishAt',
  ];
  directFields.forEach((field) => {
    if (b[field] !== undefined) workshop[field] = b[field];
  });

  // Status transitions go through their own endpoint (publish/archive/cancel)
  // so each transition can carry its own side effects as later phases add them.
  await workshop.save();
  res.json(workshop);
});

/**
 * POST /api/workshops/:id/status — Admin only. A single, explicit place
 * for lifecycle transitions rather than letting `status` be set silently
 * via the generic update above.
 */
const setWorkshopStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!Workshop.STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  const workshop = await Workshop.findById(req.params.id);
  if (!workshop) return res.status(404).json({ error: 'Workshop not found.' });

  workshop.status = status;
  if (status === 'published' && !workshop.publishedAt) workshop.publishedAt = new Date();
  if (status === 'archived') workshop.archivedAt = new Date();
  await workshop.save();
  await logActivity({
    actor: { id: req.user.id, role: 'Admin', name: req.user.name, action: `workshop.${status}`, targetType: 'Workshop', targetId: workshop._id },
    message: `Set workshop "${workshop.title}" to ${status}.`,
  });
  res.json(workshop);
});

/** DELETE /api/workshops/:id — Admin only. Hard delete; only sensible while no registrations/assessments can yet exist against it (Phase 1). */
const deleteWorkshop = asyncHandler(async (req, res) => {
  const workshop = await Workshop.findByIdAndDelete(req.params.id);
  if (!workshop) return res.status(404).json({ error: 'Workshop not found.' });
  await logActivity({
    actor: { id: req.user.id, role: 'Admin', name: req.user.name, action: 'workshop.deleted', targetType: 'Workshop', targetId: workshop._id },
    message: `Deleted workshop "${workshop.title}".`,
  });
  res.json({ success: true });
});

module.exports = { listWorkshops, getWorkshop, createWorkshop, updateWorkshop, setWorkshopStatus, deleteWorkshop };
