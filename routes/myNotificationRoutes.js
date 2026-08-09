const express = require('express');
const ctrl = require('../controllers/myNotificationController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { doubleCsrfProtection } = require('../middleware/csrf');

const router = express.Router();

router.get('/', authenticate, authorize('viewer'), ctrl.listMine);
router.post('/:id/read', authenticate, authorize('viewer'), doubleCsrfProtection, ctrl.markRead);
router.post('/read-all', authenticate, authorize('viewer'), doubleCsrfProtection, ctrl.markAllRead);

module.exports = router;
