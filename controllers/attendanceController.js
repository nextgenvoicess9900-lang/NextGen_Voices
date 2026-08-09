const Attendance = require('../models/Attendance');
const Registration = require('../models/Registration');
const WorkshopAssignment = require('../models/WorkshopAssignment');
const asyncHandler = require('../utils/asyncHandler');

/** Editors only get attendance access for workshops they're actually assigned to. */
async function assertEditorAccess(workshopId, editorId, requireMarkPermission) {
  const assignment = await WorkshopAssignment.findOne({ workshop: workshopId, editor: editorId });
  if (!assignment) return { ok: false, error: 'You are not assigned to this workshop.' };
  if (requireMarkPermission && !assignment.canMarkAttendance) return { ok: false, error: 'You do not have permission to mark attendance for this workshop.' };
  return { ok: true };
}

/** GET /api/workshops/:id/attendance — Admin, or an Editor assigned to this workshop. */
const listWorkshopAttendance = asyncHandler(async (req, res) => {
  if (req.user.role === 'editor') {
    const access = await assertEditorAccess(req.params.id, req.user.id, false);
    if (!access.ok) return res.status(403).json({ error: access.error });
  }

  const records = await Attendance.find({ workshop: req.params.id })
    .populate({ path: 'viewer', select: 'fullName email institution profilePhoto' })
    .sort({ createdAt: 1 });

  const summary = {
    total: records.length,
    present: records.filter((r) => r.status === 'present').length,
    absent: records.filter((r) => r.status === 'absent').length,
    partial: records.filter((r) => r.status === 'partial').length,
  };
  res.json({ records, summary });
});

/**
 * POST /api/attendance/:id — Admin, or an Editor assigned to this workshop
 * with `canMarkAttendance`. Body: { status, method, joinedAt, leftAt,
 * durationMinutes, percentage }.
 */
const markAttendance = asyncHandler(async (req, res) => {
  const attendance = await Attendance.findById(req.params.id);
  if (!attendance) return res.status(404).json({ error: 'Attendance record not found.' });

  if (req.user.role === 'editor') {
    const access = await assertEditorAccess(attendance.workshop, req.user.id, true);
    if (!access.ok) return res.status(403).json({ error: access.error });
  }

  const { status, method, joinedAt, leftAt, durationMinutes, percentage } = req.body;
  if (status) attendance.status = status;
  if (method) attendance.method = method;
  if (joinedAt) attendance.joinedAt = joinedAt;
  if (leftAt) attendance.leftAt = leftAt;
  if (durationMinutes != null) attendance.durationMinutes = durationMinutes;
  if (percentage != null) attendance.percentage = Math.max(0, Math.min(100, percentage));
  attendance.verifiedBy = req.user.id;
  attendance.verifiedByRole = req.user.role === 'admin' ? 'Admin' : 'Editor';
  attendance.verifiedAt = new Date();
  await attendance.save();
  res.json(attendance);
});

module.exports = { listWorkshopAttendance, markAttendance };
