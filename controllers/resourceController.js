const WorkshopResource = require('../models/WorkshopResource');
const WorkshopAssignment = require('../models/WorkshopAssignment');
const Registration = require('../models/Registration');
const Attendance = require('../models/Attendance');
const asyncHandler = require('../utils/asyncHandler');
const { sanitizePlainText } = require('../utils/sanitizeContent');

/**
 * GET /api/workshops/:id/resources
 * Admin and assigned Editors see everything. Viewers only see resources
 * whose visibility they actually qualify for, and only once released —
 * enforced here, not just hidden client-side.
 */
const listWorkshopResources = asyncHandler(async (req, res) => {
  const all = await WorkshopResource.find({ workshop: req.params.id }).sort({ createdAt: -1 });

  if (req.user && req.user.role === 'admin') return res.json({ resources: all });
  if (req.user && req.user.role === 'editor') {
    const assignment = await WorkshopAssignment.findOne({ workshop: req.params.id, editor: req.user.id });
    if (assignment) return res.json({ resources: all });
  }

  // Viewer (or guest) — compute what they actually qualify to see.
  let registration = null;
  let attendance = null;
  if (req.user && req.user.role === 'viewer') {
    registration = await Registration.findOne({ workshop: req.params.id, viewer: req.user.id, status: 'registered' });
    if (registration) attendance = await Attendance.findOne({ registration: registration._id });
  }
  const now = new Date();
  const visible = all.filter((r) => {
    if (r.releaseTiming === 'custom' && r.releaseAt && now < new Date(r.releaseAt)) return false;
    if (r.visibility === 'public') return true;
    if (r.visibility === 'registered') return !!registration;
    if (r.visibility === 'attended') return !!attendance && attendance.status !== 'absent';
    return false;
  });
  res.json({ resources: visible });
});

/** POST /api/workshops/:id/resources — Admin, or an Editor assigned to this workshop. */
const uploadResource = asyncHandler(async (req, res) => {
  if (req.user.role === 'editor') {
    const assignment = await WorkshopAssignment.findOne({ workshop: req.params.id, editor: req.user.id });
    if (!assignment) return res.status(403).json({ error: 'You are not assigned to this workshop.' });
  }
  const b = req.body;
  if (!b.title || !b.title.trim()) return res.status(400).json({ error: 'Resource title is required.' });
  if (!b.fileUrl && !b.externalLink) return res.status(400).json({ error: 'Upload a file or provide a link.' });

  const resource = await WorkshopResource.create({
    workshop: req.params.id,
    type: b.type || 'other',
    title: sanitizePlainText(b.title),
    fileUrl: b.fileUrl || '',
    externalLink: b.externalLink || '',
    fileSizeLabel: b.fileSizeLabel || '',
    visibility: b.visibility || 'registered',
    releaseTiming: b.releaseTiming || 'immediately',
    releaseAt: b.releaseAt || undefined,
    uploadedBy: req.user.id,
    uploadedByRole: req.user.role === 'admin' ? 'Admin' : 'Editor',
  });
  res.status(201).json(resource);
});

/** DELETE /api/resources/:id — Admin, or the assigned Editor for that workshop. */
const deleteResource = asyncHandler(async (req, res) => {
  const resource = await WorkshopResource.findById(req.params.id);
  if (!resource) return res.status(404).json({ error: 'Resource not found.' });
  if (req.user.role === 'editor') {
    const assignment = await WorkshopAssignment.findOne({ workshop: resource.workshop, editor: req.user.id });
    if (!assignment) return res.status(403).json({ error: 'You are not assigned to this workshop.' });
  }
  await resource.deleteOne();
  res.json({ success: true });
});

module.exports = { listWorkshopResources, uploadResource, deleteResource };
