const express = require('express');
const { body } = require('express-validator');
const ctrl = require('../controllers/counselingController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { doubleCsrfProtection } = require('../middleware/csrf');
const validate = require('../middleware/validate');

const router = express.Router();

// Public — anyone can see open slots before deciding to register.
router.get('/slots', ctrl.listOpenSlots);

// Admin/Editor — offer & manage slots.
router.get('/slots/mine', authenticate, authorize('admin', 'editor'), ctrl.listMyHostedSlots);
router.post(
  '/slots',
  authenticate,
  authorize('admin', 'editor'),
  doubleCsrfProtection,
  [body('date').notEmpty(), body('startTime').notEmpty(), body('endTime').notEmpty()],
  validate,
  ctrl.createSlot
);
router.delete('/slots/:id', authenticate, authorize('admin', 'editor'), doubleCsrfProtection, ctrl.cancelSlotAsHost);

// Viewer — book & manage their own sessions.
router.post('/slots/:id/book', authenticate, authorize('viewer'), doubleCsrfProtection, ctrl.bookSlot);
router.get('/bookings/mine', authenticate, authorize('viewer'), ctrl.listMyBookings);
router.post('/slots/:id/cancel-booking', authenticate, authorize('viewer'), doubleCsrfProtection, ctrl.cancelMyBooking);

module.exports = router;
