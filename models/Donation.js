const mongoose = require('mongoose');

/**
 * Donation — one contribution. Lifecycle: 'created' (a Razorpay order was
 * opened, no money moved yet) -> 'completed' (signature verified server-
 * side, see controllers/donationController.verifyPayment) or 'failed'.
 * Only 'completed' donations count toward a Cause's raisedAmount, the
 * impact dashboard, or the Wall of Gratitude — an unverified 'created'
 * row is never treated as real money.
 */
const donationSchema = new mongoose.Schema(
  {
    cause: { type: mongoose.Schema.Types.ObjectId, ref: 'Cause', required: true },
    amount: { type: Number, required: true, min: 1 }, // in the smallest currency unit's display form (rupees, not paise)
    currency: { type: String, default: 'INR' },

    // Donor identity is optional — a donation can be fully anonymous.
    donorName: { type: String, trim: true, default: 'Anonymous' },
    donorEmail: { type: String, trim: true, lowercase: true },
    viewer: { type: mongoose.Schema.Types.ObjectId, ref: 'Viewer' }, // set if the donor was logged in
    anonymous: { type: Boolean, default: false },
    message: { type: String, trim: true, maxlength: 280 }, // shown on the Wall of Gratitude if present

    status: { type: String, enum: ['created', 'completed', 'failed'], default: 'created' },

    // Razorpay identifiers — order is created before checkout opens;
    // payment/signature are only populated after a successful charge.
    razorpayOrderId: { type: String, required: true },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
  },
  { timestamps: true }
);

donationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Donation', donationSchema);
