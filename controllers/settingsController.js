const Settings = require('../models/Settings');
const asyncHandler = require('../utils/asyncHandler');
const logActivity = require('../utils/logActivity');

/** Ensures exactly one Settings document exists and returns it. */
async function getSingleton() {
  let doc = await Settings.findOne();
  if (!doc) doc = await Settings.create({});
  return doc;
}

/** GET /api/settings — public read (site name/logo/social links are not secret). */
const getSettings = asyncHandler(async (req, res) => {
  res.json(await getSingleton());
});

/** PUT /api/settings — Admin only. */
const updateSettings = asyncHandler(async (req, res) => {
  const doc = await getSingleton();
  Object.assign(doc, req.body);
  await doc.save();

  await logActivity({
    actor: { id: req.user.id, role: 'Admin', name: req.user.name, action: 'settings.updated', targetType: 'Settings', targetId: doc._id },
    message: 'Updated site settings.',
  });

  res.json(doc);
});

module.exports = { getSettings, updateSettings };
