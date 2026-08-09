const express = require('express');
const ctrl = require('../controllers/attemptController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { doubleCsrfProtection } = require('../middleware/csrf');

const router = express.Router();

// ---- Viewer: taking the exam, own attempt only (enforced in controller) ----
router.post('/:id/answer', authenticate, authorize('viewer'), doubleCsrfProtection, ctrl.saveAnswer);
router.post('/:id/violation', authenticate, authorize('viewer'), doubleCsrfProtection, ctrl.recordViolation);
router.post('/:id/submit', authenticate, authorize('viewer'), doubleCsrfProtection, ctrl.submitAttempt);

// ---- Admin: paper review + manual grading ----
router.get('/:id', authenticate, authorize('admin'), ctrl.getAttemptDetail);
router.post('/:id/grade', authenticate, authorize('admin'), doubleCsrfProtection, ctrl.manualGrade);

module.exports = router;
