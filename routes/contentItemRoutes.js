const express = require('express');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { doubleCsrfProtection } = require('../middleware/csrf');
const ctrl = require('../controllers/contentItemController');

const router = express.Router();

/** GET /api/content-items — public sees published only; admins see all (scope by ?type=). */
router.get('/', ctrl.list);

/** All mutations are admin-only + CSRF-protected. */
router.post('/', authenticate, authorize('admin'), doubleCsrfProtection, ctrl.create);
router.put('/:id', authenticate, authorize('admin'), doubleCsrfProtection, ctrl.update);
router.delete('/:id', authenticate, authorize('admin'), doubleCsrfProtection, ctrl.remove);

module.exports = router;
