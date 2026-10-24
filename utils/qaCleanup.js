/* QA-TEST CLEANUP — deletes ONLY records created by the audit battery.
   Every deletion is scoped to the QA-TEST marker or the exact QA fixture
   identifiers, so no real user data can be touched.
   Run: node utils/qaCleanup.js */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { connectDB, dbStatus } = require('../config/db');

const MARK = /^QA-TEST/;
const QA_ADMIN_ID = 'QA_TEST_admin_audit';
const QA_EMAIL = 'qa-test-audit@nextgen-test.invalid';
const QA_EMAIL_B = 'qa-test-audit-b@nextgen-test.invalid';
const QA_EDITOR_USER = 'qa_test_editor';

(async () => {
  const conn = await connectDB({ retry: false });
  if (!conn) { console.error('CLEANUP_FAIL cannot_connect:', dbStatus()); process.exit(1); }

  const Admin = require('../models/Admin');
  const Viewer = require('../models/Viewer');
  const Editor = require('../models/Editor');
  const Post = require('../models/Post');
  const ContentItem = require('../models/ContentItem');
  const Workshop = require('../models/Workshop');
  const Announcement = require('../models/Announcement');
  const Notification = require('../models/Notification');
  const Registration = require('../models/Registration');
  const UserNotification = require('../models/UserNotification');
  const ActivityLog = require('../models/ActivityLog');
  const WorkshopResource = require('../models/WorkshopResource');

  const Attendance = require('../models/Attendance');

  // Uploaded files are renamed to UUIDs by multer, so collect the exact
  // paths referenced by QA-TEST documents before deleting them.
  const uploadDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
  const orphanFiles = new Set(['QA-TEST.png', 'QA-TEST.pdf']); // literal-named leftovers, if any
  const harvest = (u) => { if (typeof u === 'string' && u.startsWith('/uploads/')) orphanFiles.add(path.basename(u)); };
  for (const p of await Post.find({ title: MARK }).select('coverImage')) harvest(p.coverImage);
  for (const w of await Workshop.find({ title: MARK }).select('bannerImage thumbnailImage')) { harvest(w.bannerImage); harvest(w.thumbnailImage); }
  for (const res of await WorkshopResource.find({ title: MARK }).select('fileUrl')) harvest(res.fileUrl);

  const admin = await Admin.findOne({ userId: QA_ADMIN_ID });
  const viewer = await Viewer.findOne({ email: QA_EMAIL });
  const viewerB = await Viewer.findOne({ email: QA_EMAIL_B });
  // Registrations, notifications and attendance belong to the QA viewers / QA workshops.
  const qaWorkshopIds = (await Workshop.find({ title: MARK }).select('_id')).map(w => w._id);
  const qaViewerIds = [viewer && viewer._id, viewerB && viewerB._id].filter(Boolean);
  if (qaViewerIds.length) {
    const reg = await Registration.deleteMany({ viewer: { $in: qaViewerIds } });
    const un = await UserNotification.deleteMany({ recipient: { $in: qaViewerIds } });
    const at = await Attendance.deleteMany({ viewer: { $in: qaViewerIds } });
    console.log('CLEANUP registrations', reg.deletedCount, 'user_notifications', un.deletedCount, 'attendance', at.deletedCount);
  }
  if (qaWorkshopIds.length) {
    const reg2 = await Registration.deleteMany({ workshop: { $in: qaWorkshopIds } });
    const un2 = await UserNotification.deleteMany({ workshop: { $in: qaWorkshopIds } });
    const at2 = await Attendance.deleteMany({ workshop: { $in: qaWorkshopIds } });
    console.log('CLEANUP ws_registrations', reg2.deletedCount, 'ws_user_notifications', un2.deletedCount, 'ws_attendance', at2.deletedCount);
  }

  // Orphan uploaded files (collected above, after all deletions captured refs).
  let filesRemoved = 0;
  for (const f of orphanFiles) {
    const p = path.join(uploadDir, path.basename(f));
    if (fs.existsSync(p)) { fs.unlinkSync(p); filesRemoved++; }
  }
  console.log('CLEANUP files_removed', filesRemoved);

  // Marked content.
  const c1 = await Post.deleteMany({ title: MARK });
  const c2 = await ContentItem.deleteMany({ title: MARK });
  const c3 = await Workshop.deleteMany({ title: MARK });
  const c4 = await Announcement.deleteMany({ title: MARK });
  const c5 = await Notification.deleteMany({ title: MARK });
  const c6 = await WorkshopResource.deleteMany({ title: MARK });
  console.log('CLEANUP posts', c1.deletedCount, 'content_items', c2.deletedCount, 'workshops', c3.deletedCount);
  console.log('CLEANUP announcements', c4.deletedCount, 'notifications', c5.deletedCount, 'ws_resources', c6.deletedCount);

  // ActivityLog.actor is a plain ObjectId (refPath actorRole); actorName is a
  // separate string field. Match either, plus the QA marker in the message.
  const qaActorIds = [admin && admin._id, viewer && viewer._id, viewerB && viewerB._id].filter(Boolean);
  const al = await ActivityLog.deleteMany({ $or: [{ actor: { $in: qaActorIds } }, { actorName: MARK }, { message: MARK }] });
  console.log('CLEANUP activity_logs', al.deletedCount);

  // Fixture accounts last.
  if (viewerB) { const d = await Viewer.deleteOne({ _id: viewerB._id }); console.log('CLEANUP viewerB', d.deletedCount); }
  if (viewer) { const d = await Viewer.deleteOne({ _id: viewer._id }); console.log('CLEANUP viewer', d.deletedCount); }
  if (admin) { const d = await Admin.deleteOne({ _id: admin._id }); console.log('CLEANUP admin', d.deletedCount); }
  const ed = await Editor.deleteOne({ username: QA_EDITOR_USER });
  console.log('CLEANUP editor', ed.deletedCount);

  await mongoose.disconnect();
  console.log('CLEANUP_DONE');
  process.exit(0);
})().catch(e => { console.error('CLEANUP_FAIL', e.message); process.exit(1); });
