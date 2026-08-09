const express = require('express');
const ctrl = require('../controllers/editorController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { doubleCsrfProtection } = require('../middleware/csrf');

const router = express.Router();

// Public — no login required (this is the "View Profile" link under posts).
// Registered before the admin gate below, so it's exempt from it.
router.get('/:id/public', authenticate.authenticateOptional, ctrl.getPublicEditor);

// Every route below requires a logged-in Admin.
router.use(authenticate, authorize('admin'));

router.get('/pending', ctrl.listPending);
router.get('/', ctrl.listActive);
router.post('/:id/accept', doubleCsrfProtection, ctrl.acceptEditor);
router.post('/:id/revoke', doubleCsrfProtection, ctrl.revokeEditor);
router.delete('/:id', doubleCsrfProtection, ctrl.deleteEditor);
router.get('/:id/analytics', ctrl.editorAnalytics); // allowed for self too, checked in controller

module.exports = router;
