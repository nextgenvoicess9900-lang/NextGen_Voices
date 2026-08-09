const express = require('express');
const { body } = require('express-validator');
const ctrl = require('../controllers/notificationController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { doubleCsrfProtection } = require('../middleware/csrf');
const validate = require('../middleware/validate');

const router = express.Router();

router.get('/', ctrl.listPublic); // public
router.get('/all', authenticate, authorize('admin', 'editor'), ctrl.listAll);

router.post(
  '/',
  authenticate,
  authorize('admin'),
  doubleCsrfProtection,
  [body('title').trim().notEmpty(), body('message').trim().notEmpty(), body('priority').isIn(['high', 'medium', 'low'])],
  validate,
  ctrl.createNotification
);

router.put('/:id', authenticate, authorize('admin'), doubleCsrfProtection, ctrl.updateNotification);
router.delete('/:id', authenticate, authorize('admin'), doubleCsrfProtection, ctrl.deleteNotification);

module.exports = router;
