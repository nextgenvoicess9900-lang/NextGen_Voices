const Workshop = require('../models/Workshop');
const WorkshopAssignment = require('../models/WorkshopAssignment');
const Editor = require('../models/Editor');
const asyncHandler = require('../utils/asyncHandler');
const { sanitizePlainText } = require('../utils/sanitizeContent');
const logActivity = require('../utils/logActivity');

/** POST /api/workshops/:id/assignments — Admin only. Assigns an Editor to a workshop. */
const assignEditor = asyncHandler(async (req, res) => {
  const workshop = await Workshop.findById(req.params.id);
  if (!workshop) return res.status(404).json({ error: 'Workshop not found.' });

  const { editorId, role, canMarkAttendance, reportingTime } = req.body;
  const editor = await Editor.findById(editorId).select('_id');
  if (!editor) return res.status(404).json({ error: 'Editor not found.' });

  const existing = await WorkshopAssignment.findOne({ workshop: workshop._id, editor: editorId });
  if (existing) return res.status(409).json({ error: 'This editor is already assigned to this workshop.' });

  const assignment = await WorkshopAssignment.create({
    workshop: workshop._id,
    editor: editorId,
    role: role || 'general',
    canMarkAttendance: !!canMarkAttendance,
    reportingTime: sanitizePlainText(reportingTime || workshop.volunteerReportingTime || ''),
    checklist: WorkshopAssignment.CHECKLIST_DEFAULTS.map((label) => ({ label, done: false })),
    assignedBy: req.user.id,
  });
  await logActivity({
    actor: { id: req.user.id, role: 'Admin', name: req.user.name, action: 'workshop.editor_assigned', targetType: 'WorkshopAssignment', targetId: assignment._id },
    message: `Assigned an editor to workshop "${workshop.title}".`,
  });
  res.status(201).json(assignment);
});

/** GET /api/workshops/:id/assignments — Admin only. */
const listWorkshopAssignments = asyncHandler(async (req, res) => {
  const assignments = await WorkshopAssignment.find({ workshop: req.params.id })
    .populate('editor', 'fullName publicDisplayName profilePhoto email');
  res.json({ assignments });
});

/** DELETE /api/assignments/:id — Admin only. */
const removeAssignment = asyncHandler(async (req, res) => {
  const a = await WorkshopAssignment.findByIdAndDelete(req.params.id);
  if (!a) return res.status(404).json({ error: 'Assignment not found.' });
  res.json({ success: true });
});

/** GET /api/assignments/mine — Editor only. Powers "My Workshops" for editors. */
const myAssignments = asyncHandler(async (req, res) => {
  const assignments = await WorkshopAssignment.find({ editor: req.user.id })
    .populate('workshop')
    .sort({ createdAt: -1 });
  res.json({ assignments });
});

/** POST /api/assignments/:id/accept — Editor only, own assignment. */
const acceptAssignment = asyncHandler(async (req, res) => {
  const a = await WorkshopAssignment.findOne({ _id: req.params.id, editor: req.user.id });
  if (!a) return res.status(404).json({ error: 'Assignment not found.' });
  a.status = 'accepted';
  await a.save();
  res.json(a);
});

/** POST /api/assignments/:id/checklist — Editor (own) or Admin. Body: { index, done }. */
const toggleChecklistItem = asyncHandler(async (req, res) => {
  const query = req.user.role === 'admin' ? { _id: req.params.id } : { _id: req.params.id, editor: req.user.id };
  const a = await WorkshopAssignment.findOne(query);
  if (!a) return res.status(404).json({ error: 'Assignment not found.' });

  const { index, done } = req.body;
  if (!a.checklist[index]) return res.status(400).json({ error: 'Invalid checklist item.' });
  a.checklist[index].done = !!done;
  a.checklist[index].doneAt = done ? new Date() : undefined;
  await a.save();
  res.json(a);
});

module.exports = { assignEditor, listWorkshopAssignments, removeAssignment, myAssignments, acceptAssignment, toggleChecklistItem };
