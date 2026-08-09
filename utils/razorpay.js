const Razorpay = require('razorpay');

/**
 * Lazily-constructed Razorpay client. Returns null if keys aren't
 * configured (local dev) so callers can return a clear, honest error
 * instead of the request crashing — the Donation Center is fully
 * buildable/testable without a real merchant account, it just can't
 * actually take payments until RAZORPAY_KEY_ID/SECRET are set.
 */
let client = null;
function getRazorpay() {
  if (client) return client;
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
  client = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
  return client;
}

module.exports = { getRazorpay };
