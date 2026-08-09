const Viewer = require('../models/Viewer');
const Editor = require('../models/Editor');
const asyncHandler = require('../utils/asyncHandler');
const { sanitizePlainText } = require('../utils/sanitizeContent');

/** GET /api/viewers/me — viewer only. */
const getProfile = asyncHandler(async (req, res) => {
  const viewer = await Viewer.findById(req.user.id)
    .populate({ path: 'readingHistory.post', select: 'title coverImage contentType' });
  if (!viewer) return res.status(404).json({ error: 'Account not found.' });
  res.json(viewer);
});

/**
 * PUT /api/viewers/me — viewer only.
 * Updates profile fields and/or the email-notification opt-in flag.
 */
const updateProfile = asyncHandler(async (req, res) => {
  const { fullName, institution, emailNotifications } = req.body;
  const viewer = await Viewer.findById(req.user.id);
  if (!viewer) return res.status(404).json({ error: 'Account not found.' });

  if (fullName !== undefined) viewer.fullName = sanitizePlainText(fullName);
  if (institution !== undefined) viewer.institution = sanitizePlainText(institution);
  if (typeof emailNotifications === 'boolean') viewer.emailNotifications = emailNotifications;

  await viewer.save();
  res.json({ id: viewer._id, fullName: viewer.fullName, institution: viewer.institution, emailNotifications: viewer.emailNotifications });
});

/**
 * PUT /api/viewers/me/interests — viewer only.
 * Replaces the viewer's interest list wholesale (simplest, matches how the
 * Settings UI sends it — the full current selection each time).
 */
const updateInterests = asyncHandler(async (req, res) => {
  const { interests = [] } = req.body;
  const viewer = await Viewer.findById(req.user.id);
  if (!viewer) return res.status(404).json({ error: 'Account not found.' });
  viewer.interests = interests.map(sanitizePlainText).filter(Boolean).slice(0, 30);
  await viewer.save();
  res.json({ interests: viewer.interests });
});

/** POST /api/viewers/me/follows/:tag — viewer only. Toggles following a hashtag. */
const toggleFollowHashtag = asyncHandler(async (req, res) => {
  const tag = sanitizePlainText(req.params.tag);
  const viewer = await Viewer.findById(req.user.id);
  if (!viewer) return res.status(404).json({ error: 'Account not found.' });
  const idx = viewer.followedHashtags.findIndex(t => t.toLowerCase() === tag.toLowerCase());
  const following = idx < 0;
  if (following) viewer.followedHashtags.push(tag);
  else viewer.followedHashtags.splice(idx, 1);
  await viewer.save();
  res.json({ following, followedHashtags: viewer.followedHashtags });
});

/** POST /api/viewers/me/follow-editor/:editorId — viewer only. Toggles following an editor. */
const toggleFollowEditor = asyncHandler(async (req, res) => {
  const editorId = req.params.editorId;
  const editor = await Editor.findById(editorId).select('_id');
  if (!editor) return res.status(404).json({ error: 'Editor not found.' });

  const viewer = await Viewer.findById(req.user.id);
  if (!viewer) return res.status(404).json({ error: 'Account not found.' });

  const idx = viewer.followedEditors.findIndex(e => e.toString() === editorId);
  const following = idx < 0;
  if (following) viewer.followedEditors.push(editorId);
  else viewer.followedEditors.splice(idx, 1);
  await viewer.save();
  res.json({ following, followedEditors: viewer.followedEditors });
});

module.exports = { getProfile, updateProfile, updateInterests, toggleFollowHashtag, toggleFollowEditor };
