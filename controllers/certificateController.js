const Certificate = require('../models/Certificate');
const Registration = require('../models/Registration');
const Attendance = require('../models/Attendance');
const Assessment = require('../models/Assessment');
const AssessmentAttempt = require('../models/AssessmentAttempt');
const Workshop = require('../models/Workshop');
const UserNotification = require('../models/UserNotification');
const asyncHandler = require('../utils/asyncHandler');
const logActivity = require('../utils/logActivity');

/**
 * Certificate eligibility (Chapter 5): registered + attended + (if the
 * workshop has a published assessment) passed it. Computed fresh every
 * time, never cached, so it can't drift from the real attendance/result data.
 */
async function computeEligibleStudents(workshopId) {
  const registrations = await Registration.find({ workshop: workshopId, status: 'registered' }).populate('viewer', 'fullName email institution profilePhoto');
  const assessment = await Assessment.findOne({ workshop: workshopId, status: 'published' });

  const results = [];
  for (const reg of registrations) {
    const attendance = await Attendance.findOne({ registration: reg._id });
    const attended = !!attendance && attendance.status !== 'absent';
    let passed = true; // no assessment => attendance alone is sufficient
    if (assessment) {
      const attempt = await AssessmentAttempt.findOne({ assessment: assessment._id, viewer: reg.viewer._id, status: { $ne: 'in-progress' } }).sort({ submittedAt: -1 });
      passed = !!attempt && attempt.passFail === 'pass';
    }
    results.push({ viewer: reg.viewer, registrationId: reg._id, attended, passed, eligible: attended && passed });
  }
  return results;
}

/** GET /api/workshops/:id/certificates — Admin only. */
const listWorkshopCertificates = asyncHandler(async (req, res) => {
  const eligible = await computeEligibleStudents(req.params.id);
  const certs = await Certificate.find({ workshop: req.params.id });
  const certByViewer = new Map(certs.map((c) => [c.viewer.toString(), c]));

  const rows = eligible.map((e) => ({
    viewer: e.viewer, eligible: e.eligible, attended: e.attended, passed: e.passed,
    certificate: certByViewer.get(e.viewer._id.toString()) || null,
  }));
  res.json({
    rows,
    totalEligible: eligible.filter((e) => e.eligible).length,
    uploaded: certs.length,
    pending: eligible.filter((e) => e.eligible).length - certs.length,
  });
});

/** POST /api/workshops/:id/certificates — Admin only. Body: { viewerId, fileUrl, fileType }. */
const uploadCertificate = asyncHandler(async (req, res) => {
  const { viewerId, fileUrl, fileType } = req.body;
  if (!fileUrl || !['pdf', 'png', 'jpeg'].includes(fileType)) {
    return res.status(400).json({ error: 'A PDF, PNG, or JPEG certificate file is required.' });
  }
  const eligible = await computeEligibleStudents(req.params.id);
  const match = eligible.find((e) => e.viewer._id.toString() === viewerId);
  if (!match || !match.eligible) {
    return res.status(403).json({ error: 'This student is not eligible for a certificate (must have attended, and passed the assessment if one exists).' });
  }

  let certificate = await Certificate.findOne({ workshop: req.params.id, viewer: viewerId });
  if (certificate) {
    certificate.fileUrl = fileUrl;
    certificate.fileType = fileType;
    certificate.uploadedBy = req.user.id;
    certificate.uploadedAt = new Date();
    await certificate.save();
  } else {
    certificate = await Certificate.create({
      workshop: req.params.id, viewer: viewerId, fileUrl, fileType,
      certificateId: Certificate.generateCertificateId(), uploadedBy: req.user.id,
    });
  }

  const workshop = await Workshop.findById(req.params.id);
  await UserNotification.create({
    recipient: viewerId, workshop: workshop._id, type: 'certificate-ready',
    title: 'Certificate Ready 🎓',
    message: `Your certificate for "${workshop.title}" is now available for download.`,
    link: `#/ws/${workshop._id}`,
  });
  await logActivity({
    actor: { id: req.user.id, role: 'Admin', name: req.user.name, action: 'certificate.uploaded', targetType: 'Certificate', targetId: certificate._id },
    message: `Uploaded certificate "${certificate.certificateId}" for workshop "${workshop.title}".`,
  });
  res.status(201).json(certificate);
});

/** DELETE /api/certificates/:id — Admin only. */
const removeCertificate = asyncHandler(async (req, res) => {
  const c = await Certificate.findByIdAndDelete(req.params.id);
  if (!c) return res.status(404).json({ error: 'Certificate not found.' });
  res.json({ success: true });
});

/** GET /api/certificates/mine — Viewer only. */
const myCertificates = asyncHandler(async (req, res) => {
  const certs = await Certificate.find({ viewer: req.user.id }).populate('workshop', 'title bannerImage schedule speaker').sort({ uploadedAt: -1 });
  res.json({ certificates: certs });
});

/** POST /api/certificates/:id/download-log — Viewer only, own certificate. */
const logDownload = asyncHandler(async (req, res) => {
  const c = await Certificate.findOne({ _id: req.params.id, viewer: req.user.id });
  if (!c) return res.status(404).json({ error: 'Certificate not found.' });
  c.downloads.push({ at: new Date() });
  await c.save();
  res.json({ success: true, totalDownloads: c.downloads.length });
});

/**
 * GET /api/certificates/verify/:certificateId — PUBLIC, no auth. This is
 * what the QR code on the certificate points to. Deliberately returns the
 * minimum needed to prove authenticity, not the full student record.
 */
const verifyCertificate = asyncHandler(async (req, res) => {
  const c = await Certificate.findOne({ certificateId: req.params.certificateId })
    .populate('workshop', 'title schedule')
    .populate('viewer', 'fullName');
  if (!c) return res.status(404).json({ valid: false });
  res.json({
    valid: true,
    certificateId: c.certificateId,
    workshopTitle: c.workshop.title,
    studentName: c.viewer.fullName,
    issueDate: c.uploadedAt,
  });
});

module.exports = { listWorkshopCertificates, uploadCertificate, removeCertificate, myCertificates, logDownload, verifyCertificate };
