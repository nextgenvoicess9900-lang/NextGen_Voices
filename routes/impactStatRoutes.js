const express = require('express');
const { body } = require('express-validator');
const ctrl = require('../controllers/impactStatController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { doubleCsrfProtection } = require('../middleware/csrf');
const validate = require('../middleware/validate');

const router = express.Router();

router.get('/admin/all', authenticate, authorize('admin'), ctrl.listAll);
router.post(
  '/',
  authenticate,
  authorize('admin'),
  doubleCsrfProtection,
  [body('key').trim().notEmpty(), body('label').trim().notEmpty()],
  validate,
  ctrl.upsertStat
);
router.delete('/:id', authenticate, authorize('admin'), doubleCsrfProtection, ctrl.deleteStat);

module.exports = router;
