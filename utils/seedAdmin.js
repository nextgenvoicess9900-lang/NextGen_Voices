/**
 * One-time bootstrap script: `npm run seed:admin`
 * Creates the single Admin account from environment variables. Run this
 * once after setting up the database, then keep SEED_ADMIN_PASSWORD out
 * of any shared environment file going forward.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Admin = require('../models/Admin');

(async () => {
  await connectDB();

  const userId = process.env.SEED_ADMIN_USER_ID;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!userId || !password) {
    console.error('SEED_ADMIN_USER_ID and SEED_ADMIN_PASSWORD must be set in .env');
    process.exit(1);
  }

  const existing = await Admin.findOne({ userId });
  if (existing) {
    console.log(`Admin "${userId}" already exists — skipping.`);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await Admin.create({ userId, passwordHash, name: 'NEXTGEN Admin' });
  console.log(`Admin account "${userId}" created. You can now log in from the dashboard.`);
  process.exit(0);
})();
