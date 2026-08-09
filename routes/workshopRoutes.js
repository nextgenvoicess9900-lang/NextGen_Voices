const express = require('express');
const { body } = require('express-validator');
const ctrl = require('../controllers/workshopController');
const regCtrl = require('../controllers/registrationController');
const assignCtrl = require('../controllers/assignmentController');
const attendanceCtrl = require('../controllers/attendanceController');
const assessmentCtrl = require('../controllers/assessmentController');
const attemptCtrl = require('../controllers/attemptController');
const resourceCtrl = require('../controllers/resourceController');
const certificateCtrl = require('../controllers/certificateController');
const feedbackCtrl = require('../controllers/feedbackController');
const announcementCtrl = require('../controllers/workshopAnnouncementController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { doubleCsrfProtection } = require('../middleware/csrf');
const validate = require('../middleware/validate');

const router = express.Router();

// ---- Public/Viewer read (optional auth, so admins requesting through the
// same endpoint see every status while guests/viewers only see published) ----
router.get('/', authenticate.authenticateOptional, ctrl.listWorkshops);
router.get('/:id', authenticate.authenticateOptional, ctrl.getWorkshop);

// ---- Viewer only: registration ----
router.post('/:id/register', authenticate, authorize('viewer'), doubleCsrfProtection, regCtrl.registerForWorkshop);
router.post('/:id/cancel', authenticate, authorize('viewer'), doubleCsrfProtection, regCtrl.cancelMyRegistration);
router.get('/:id/my-status', authenticate, authorize('viewer'), regCtrl.getMyRegistrationStatus);

// ---- Admin: editor assignment; Admin or assigned Editor: attendance ----
router.get('/:id/assignments', authenticate, authorize('admin'), assignCtrl.listWorkshopAssignments);
router.post('/:id/assignments', authenticate, authorize('admin'), doubleCsrfProtection, assignCtrl.assignEditor);
router.get('/:id/attendance', authenticate, authorize('admin', 'editor'), attendanceCtrl.listWorkshopAttendance);

// ---- Assessment: Admin config, Viewer attempt flow (eligibility enforced in the controller) ----
router.get('/:workshopId/assessment', authenticate, authorize('admin'), assessmentCtrl.getOrCreateAssessment);
router.get('/:workshopId/assessment/take', authenticate, authorize('viewer'), attemptCtrl.getAssessmentForAttempt);
router.post('/:workshopId/assessment/start', authenticate, authorize('viewer'), doubleCsrfProtection, attemptCtrl.startAttempt);
router.get('/:workshopId/assessment/my-result', authenticate, authorize('viewer'), attemptCtrl.getMyResult);

// ---- Resources: visibility-gated read for anyone (guests get public-only), Admin/assigned-Editor write ----
router.get('/:id/resources', authenticate.authenticateOptional, resourceCtrl.listWorkshopResources);
router.post('/:id/resources', authenticate, authorize('admin', 'editor'), doubleCsrfProtection, resourceCtrl.uploadResource);

// ---- Certificates: Admin manages, computed eligibility ----
router.get('/:id/certificates', authenticate, authorize('admin'), certificateCtrl.listWorkshopCertificates);
router.post('/:id/certificates', authenticate, authorize('admin'), doubleCsrfProtection, certificateCtrl.uploadCertificate);

// ---- Feedback: Viewer submits (must have attended), Admin views summary ----
router.post('/:id/feedback', authenticate, authorize('viewer'), doubleCsrfProtection, feedbackCtrl.submitFeedback);
router.get('/:id/feedback/mine', authenticate, authorize('viewer'), feedbackCtrl.getMyFeedback);
router.get('/:id/feedback', authenticate, authorize('admin'), feedbackCtrl.getWorkshopFeedbackSummary);

// ---- Admin: Registration Dashboard + Workshop Announcements ----
router.get('/:id/registrations', authenticate, authorize('admin'), regCtrl.listWorkshopRegistrations);
router.get('/:id/announcements', authenticate, authorize('admin'), announcementCtrl.listWorkshopAnnouncements);
router.post('/:id/announcements', authenticate, authorize('admin'), doubleCsrfProtection, announcementCtrl.sendWorkshopAnnouncement);

// ---- Admin only ----
router.post(
  '/',
  authenticate,
  authorize('admin'),
  doubleCsrfProtection,
  [body('title').trim().notEmpty().isLength({ max: 150 })],
  validate,
  ctrl.createWorkshop
);
router.put('/:id', authenticate, authorize('admin'), doubleCsrfProtection, ctrl.updateWorkshop);
router.post(
  '/:id/status',
  authenticate,
  authorize('admin'),
  doubleCsrfProtection,
  [body('status').trim().notEmpty()],
  validate,
  ctrl.setWorkshopStatus
);
router.delete('/:id', authenticate, authorize('admin'), doubleCsrfProtection, ctrl.deleteWorkshop);

module.exports = router;
