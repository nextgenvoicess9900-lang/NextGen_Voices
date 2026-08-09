const express = require('express');
const ctrl = require('../controllers/viewerController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { doubleCsrfProtection } = require('../middleware/csrf');

const router = express.Router();

router.get('/me', authenticate, authorize('viewer'), ctrl.getProfile);
router.put('/me', authenticate, authorize('viewer'), doubleCsrfProtection, ctrl.updateProfile);
router.put('/me/interests', authenticate, authorize('viewer'), doubleCsrfProtection, ctrl.updateInterests);
router.post('/me/follows/:tag', authenticate, authorize('viewer'), doubleCsrfProtection, ctrl.toggleFollowHashtag);
router.post('/me/follow-editor/:editorId', authenticate, authorize('viewer'), doubleCsrfProtection, ctrl.toggleFollowEditor);

module.exports = router;
