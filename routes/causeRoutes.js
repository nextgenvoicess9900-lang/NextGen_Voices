const express = require('express');
const { body } = require('express-validator');
const ctrl = require('../controllers/causeController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { doubleCsrfProtection } = require('../middleware/csrf');
const validate = require('../middleware/validate');

const router = express.Router();

// ---- Public ----
router.get('/', ctrl.listActive);
router.get('/featured', ctrl.getFeatured);
router.get('/admin/all', authenticate, authorize('admin'), ctrl.listAll); // before /:id
router.get('/:id', ctrl.getOne);

// ---- Admin only ----
router.post(
  '/',
  authenticate,
  authorize('admin'),
  doubleCsrfProtection,
  [body('title').trim().notEmpty(), body('description').trim().notEmpty(), body('goalAmount').isFloat({ min: 1 })],
  validate,
  ctrl.createCause
);
router.put('/:id', authenticate, authorize('admin'), doubleCsrfProtection, ctrl.updateCause);
router.delete('/:id', authenticate, authorize('admin'), doubleCsrfProtection, ctrl.deleteCause);

module.exports = router;
