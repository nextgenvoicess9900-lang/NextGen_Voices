const crypto = require('crypto');
const Donation = require('../models/Donation');
const Cause = require('../models/Cause');
const ImpactStat = require('../models/ImpactStat');
const asyncHandler = require('../utils/asyncHandler');
const { sanitizePlainText } = require('../utils/sanitizeContent');
const { getRazorpay } = require('../utils/razorpay');
const { sendTransactionalEmail } = require('../utils/mailer');

/**
 * POST /api/donations/create-order — public (donors don't need an account).
 * Opens a Razorpay order for the given amount+cause. No money moves yet —
 * that only happens in the Razorpay checkout UI the frontend opens with
 * this order's id. We never trust an amount the client reports back later;
 * the amount is fixed here, server-side, at order-creation time.
 */
const createOrder = asyncHandler(async (req, res) => {
  const razorpay = getRazorpay();
  if (!razorpay) {
    return res.status(503).json({ error: 'Payments are not configured on this server yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to enable real donations.' });
  }

  const { causeId, amount, donorName, donorEmail, anonymous, message } = req.body;
  if (!amount || amount < 1) return res.status(400).json({ error: 'Enter a valid donation amount.' });

  const cause = await Cause.findById(causeId);
  if (!cause || !cause.active) return res.status(404).json({ error: 'This cause is not currently accepting donations.' });

  const order = await razorpay.orders.create({
    amount: Math.round(amount * 100), // Razorpay expects the smallest unit (paise for INR)
    currency: 'INR',
    receipt: `nextgen_${cause._id}_${Date.now()}`,
    notes: { causeId: String(cause._id) },
  });

  const donation = await Donation.create({
    cause: cause._id,
    amount,
    currency: 'INR',
    donorName: anonymous ? 'Anonymous' : (sanitizePlainText(donorName) || 'Anonymous'),
    donorEmail: donorEmail ? sanitizePlainText(donorEmail) : undefined,
    viewer: req.user && req.user.role === 'viewer' ? req.user.id : undefined,
    anonymous: !!anonymous,
    message: message ? sanitizePlainText(message).slice(0, 280) : undefined,
    status: 'created',
    razorpayOrderId: order.id,
  });

  res.status(201).json({
    donationId: donation._id,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: process.env.RAZORPAY_KEY_ID, // public key, safe to expose — needed by the Razorpay Checkout.js widget
  });
});

/**
 * POST /api/donations/verify — public. Called by the frontend after
 * Razorpay's checkout widget reports success. The payment is NOT trusted
 * until its HMAC-SHA256 signature (order_id + '|' + payment_id, signed
 * with the account's key secret) is verified server-side — this is the
 * standard Razorpay integration pattern and the only way to be sure the
 * "success" callback wasn't forged by a client.
 */
const verifyPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification fields.' });
  }

  const donation = await Donation.findOne({ razorpayOrderId: razorpay_order_id });
  if (!donation) return res.status(404).json({ error: 'Donation record not found for this order.' });
  if (donation.status === 'completed') return res.json({ message: 'Already verified.', donation }); // idempotent

  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    donation.status = 'failed';
    await donation.save();
    return res.status(400).json({ error: 'Payment verification failed. If money was deducted, it will be automatically refunded by Razorpay — please contact support if not.' });
  }

  donation.status = 'completed';
  donation.razorpayPaymentId = razorpay_payment_id;
  donation.razorpaySignature = razorpay_signature;
  await donation.save();

  // Keep the cause's progress bar in sync — only ever incremented by a verified donation.
  await Cause.findByIdAndUpdate(donation.cause, {
    $inc: { raisedAmount: donation.amount, supporterCount: 1 },
  });

  if (donation.donorEmail) {
    sendTransactionalEmail({
      to: donation.donorEmail,
      subject: 'Thank you for supporting NEXTGEN',
      text: `Thank you for your contribution of ₹${donation.amount}. Your generosity helps build the future of education.`,
      html: `<p>Thank you for your contribution of <b>₹${donation.amount}</b>. Your generosity helps build the future of education.</p>`,
    }).catch(()=>{});
  }

  res.json({ message: 'Payment verified. Thank you for your contribution!', donation });
});

/** GET /api/donations/impact — public. Live Impact Dashboard: curated stats + real totals. */
const impactStats = asyncHandler(async (req, res) => {
  const [curated, totals] = await Promise.all([
    ImpactStat.find().sort('order'),
    Donation.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, totalRaised: { $sum: '$amount' }, totalDonations: { $sum: 1 } } },
    ]),
  ]);
  const { totalRaised = 0, totalDonations = 0 } = totals[0] || {};
  res.json({ curated, totalRaised, totalDonations });
});

/**
 * GET /api/donations/wall — public. Wall of Gratitude: completed donations
 * that included a message, respecting the anonymous flag.
 */
const wallOfGratitude = asyncHandler(async (req, res) => {
  const { limit = 24 } = req.query;
  const donations = await Donation.find({ status: 'completed', message: { $exists: true, $ne: '' } })
    .sort('-createdAt')
    .limit(Number(limit))
    .select('donorName amount message anonymous createdAt');
  const wall = donations.map(d => ({
    name: d.anonymous ? 'Anonymous' : d.donorName,
    amount: d.anonymous ? undefined : d.amount,
    message: d.message,
    time: d.createdAt,
  }));
  res.json(wall);
});

/** GET /api/donations/tree — public. Powers the "Tree of Contributors" counter. */
const treeOfContributors = asyncHandler(async (req, res) => {
  const count = await Donation.countDocuments({ status: 'completed' });
  res.json({ count });
});

/** GET /api/donations/admin/all — admin only, full donation ledger. */
const listAllDonations = asyncHandler(async (req, res) => {
  const donations = await Donation.find().sort('-createdAt').populate('cause', 'title');
  res.json(donations);
});

module.exports = { createOrder, verifyPayment, impactStats, wallOfGratitude, treeOfContributors, listAllDonations };
