const express = require('express');
const { body } = require('express-validator');
const ctrl = require('../controllers/announcementController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { doubleCsrfProtection } = require('../middleware/csrf');
const validate = require('../middleware/validate');

const router = express.Router();

router.get('/', ctrl.listPublic); // public
router.get('/all', authenticate, authorize('admin'), ctrl.listAll);

router.post(
  '/',
  authenticate,
  authorize('admin'),
  doubleCsrfProtection,
  [body('title').trim().notEmpty(), body('description').trim().notEmpty()],
  validate,
  ctrl.createAnnouncement
);

router.delete('/:id', authenticate, authorize('admin'), doubleCsrfProtection, ctrl.deleteAnnouncement);

module.exports = router;
