const mongoose = require('mongoose');

/**
 * Admin — the single super-user role. Created only via `npm run seed:admin`
 * (see utils/seedAdmin.js). There is no public admin-registration endpoint.
 */
const adminSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, default: 'NEXTGEN Admin' },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Admin', adminSchema);
