/* QA-TEST FIXTURES — creates marked test accounts for the live audit.
   Run: node utils/qaFixtures.js   ·   Cleanup: node utils/qaCleanup.js
   Prints IDs and outcomes only — never secrets. */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { connectDB, dbStatus } = require('../config/db');
const Admin = require('../models/Admin');
const Viewer = require('../models/Viewer');
const Editor = require('../models/Editor');
const { hashOtp } = require('../utils/otp');

const QA_ADMIN_ID = 'QA_TEST_admin_audit';
const QA_ADMIN_PW = 'QA-TEST-pw-9x7';
const QA_EMAIL = 'qa-test-audit@nextgen-test.invalid';
const QA_EMAIL_B = 'qa-test-audit-b@nextgen-test.invalid'; // second student for recipient-scoping tests
const QA_OTP = '424242';

(async () => {
  const conn = await connectDB({ retry: false });
  if (!conn) { console.error('FIXTURE_FAIL cannot_connect:', dbStatus()); process.exit(1); }

  // --- Admin ---
  let admin = await Admin.findOne({ userId: QA_ADMIN_ID });
  if (!admin) {
    admin = await Admin.create({ userId: QA_ADMIN_ID, passwordHash: await bcrypt.hash(QA_ADMIN_PW, 10), name: 'QA-TEST Admin' });
    console.log('FIXTURE admin_created', admin._id.toString());
  } else {
    console.log('FIXTURE admin_exists', admin._id.toString());
  }

  // --- Viewer (student) with a known OTP so we can verify end-to-end without inbox access ---
  let viewer = await Viewer.findOne({ email: QA_EMAIL });
  if (!viewer) {
    viewer = await Viewer.create({ email: QA_EMAIL, fullName: 'QA-TEST Student', institution: 'QA Audit', otpHash: hashOtp(QA_OTP), otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000), otpAttempts: 0 });
    console.log('FIXTURE viewer_created', viewer._id.toString());
  } else {
    viewer.otpHash = hashOtp(QA_OTP); viewer.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); viewer.otpAttempts = 0; await viewer.save();
    console.log('FIXTURE viewer_exists', viewer._id.toString());
  }

  // --- Second viewer (proves private notifications aren't cross-visible) ---
  let viewerB = await Viewer.findOne({ email: QA_EMAIL_B });
  if (!viewerB) {
    viewerB = await Viewer.create({ email: QA_EMAIL_B, fullName: 'QA-TEST Student B', institution: 'QA Audit', otpHash: hashOtp(QA_OTP), otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000), otpAttempts: 0 });
    console.log('FIXTURE viewerB_created', viewerB._id.toString());
  } else {
    viewerB.otpHash = hashOtp(QA_OTP); viewerB.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); viewerB.otpAttempts = 0; await viewerB.save();
    console.log('FIXTURE viewerB_exists', viewerB._id.toString());
  }

  // --- Editor (for permission tests) ---
  let editor = await Editor.findOne({ username: 'qa_test_editor' });
  if (!editor) {
    editor = await Editor.create({ fullName: 'QA-TEST Editor', email: 'qa-test-editor@nextgen-test.invalid', username: 'qa_test_editor', passwordHash: await bcrypt.hash(QA_ADMIN_PW, 10) });
    console.log('FIXTURE editor_created', editor._id.toString());
  } else {
    console.log('FIXTURE editor_exists', editor._id.toString());
  }

  console.log('FIXTURE admin_user_id', QA_ADMIN_ID);
  console.log('FIXTURE viewer_email', QA_EMAIL);
  await mongoose.disconnect();
  process.exit(0);
})().catch(e => { console.error('FIXTURE_FAIL', e.message); process.exit(1); });
