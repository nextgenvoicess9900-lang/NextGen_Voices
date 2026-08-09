const express = require('express');
const ctrl = require('../controllers/assessmentController');
const attemptCtrl = require('../controllers/attemptController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { doubleCsrfProtection } = require('../middleware/csrf');

const router = express.Router();

router.use(authenticate, authorize('admin')); // every route below is Admin-only

router.put('/:id', doubleCsrfProtection, ctrl.updateAssessment);
router.post('/:id/publish', doubleCsrfProtection, ctrl.publishAssessment);
router.post('/:id/unpublish', doubleCsrfProtection, ctrl.unpublishAssessment);
router.post('/:id/questions', doubleCsrfProtection, ctrl.createQuestion);
router.get('/:id/responses', attemptCtrl.listResponses);

module.exports = router;
