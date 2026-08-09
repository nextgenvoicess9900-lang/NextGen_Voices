const express = require('express');
const { body } = require('express-validator');
const ctrl = require('../controllers/donationController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { doubleCsrfProtection } = require('../middleware/csrf');
const { donationLimiter } = require('../middleware/rateLimiters');
const validate = require('../middleware/validate');

const router = express.Router();

// Public reads — no login needed to see impact, the wall, or the tree count.
router.get('/impact', ctrl.impactStats);
router.get('/wall', ctrl.wallOfGratitude);
router.get('/tree', ctrl.treeOfContributors);

// Public write — donors don't need an account, but if a Viewer happens to
// be logged in we attach their id (authenticateOptional never blocks).
router.post(
  '/create-order',
  donationLimiter,
  authenticate.authenticateOptional,
  [body('causeId').notEmpty(), body('amount').isFloat({ min: 1 })],
  validate,
  ctrl.createOrder
);
router.post(
  '/verify',
  donationLimiter,
  [
    body('razorpay_order_id').notEmpty(),
    body('razorpay_payment_id').notEmpty(),
    body('razorpay_signature').notEmpty(),
  ],
  validate,
  ctrl.verifyPayment
);

// Admin only — the full ledger.
router.get('/admin/all', authenticate, authorize('admin'), ctrl.listAllDonations);

module.exports = router;
