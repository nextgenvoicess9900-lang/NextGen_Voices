const Editor = require('../models/Editor');
const PendingEditor = require('../models/PendingEditor');
const Post = require('../models/Post');
const Viewer = require('../models/Viewer');
const asyncHandler = require('../utils/asyncHandler');
const logActivity = require('../utils/logActivity');

/**
 * GET /api/editors/:id/public — no auth required (this is the "View Profile"
 * link shown under every post). If a signed-in viewer is making the
 * request, `isFollowing` reflects their real follow state; guests just
 * don't get that field rather than a fabricated `false`.
 */
const getPublicEditor = asyncHandler(async (req, res) => {
  const editor = await Editor.findById(req.params.id)
    .select('fullName publicDisplayName professionalTitle profilePhoto bio tagline areasOfExpertise socialLinks createdAt');
  if (!editor) return res.status(404).json({ error: 'Editor not found.' });

  const [postCount, followerCount] = await Promise.all([
    Post.countDocuments({ author: editor._id, status: 'published' }),
    Viewer.countDocuments({ followedEditors: editor._id }),
  ]);

  const payload = {
    id: editor._id,
    fullName: editor.fullName,
    displayName: editor.publicDisplayName || editor.fullName,
    professionalTitle: editor.professionalTitle,
    profilePhoto: editor.profilePhoto,
    bio: editor.bio,
    tagline: editor.tagline,
    areasOfExpertise: editor.areasOfExpertise,
    socialLinks: editor.socialLinks,
    verified: true, // every doc in this collection was manually Admin-approved
    postCount,
    followerCount,
    memberSince: editor.createdAt,
  };
  if (req.user && req.user.role === 'viewer') {
    const viewer = await Viewer.findById(req.user.id).select('followedEditors');
    payload.isFollowing = !!viewer?.followedEditors?.some((e) => e.toString() === editor._id.toString());
  }
  res.json(payload);
});

/** GET /api/editors/pending — Admin only. */
const listPending = asyncHandler(async (req, res) => {
  const pending = await PendingEditor.find().select('-passwordHash').sort('-createdAt');
  res.json(pending);
});

/** GET /api/editors — Admin only. Active editors. */
const listActive = asyncHandler(async (req, res) => {
  const editors = await Editor.find().select('-passwordHash').sort('-createdAt');
  res.json(editors);
});

/**
 * POST /api/editors/:id/accept — Admin only.
 * The ONLY positive action available on a pending editor (per spec: no
 * toggles). Moves the document from PendingEditor into Editor.
 */
const acceptEditor = asyncHandler(async (req, res) => {
  const pending = await PendingEditor.findById(req.params.id);
  if (!pending) return res.status(404).json({ error: 'Pending request not found.' });

  const editor = await Editor.create({
    fullName: pending.fullName,
    email: pending.email,
    institution: pending.institution,
    phone: pending.phone,
    username: pending.username,
    passwordHash: pending.passwordHash,
    profilePhoto: pending.profilePhoto,
    publicDisplayName: pending.publicDisplayName,
    professionalTitle: pending.professionalTitle,
    bio: pending.bio,
    tagline: pending.tagline,
    areasOfExpertise: pending.areasOfExpertise,
    socialLinks: pending.socialLinks,
    agreedToGuidelines: pending.agreedToGuidelines,
    agreedToReview: pending.agreedToReview,
  });
  await pending.deleteOne();

  await logActivity({
    actor: { id: req.user.id, role: 'Admin', name: req.user.name, action: 'editor.accepted', targetType: 'Editor', targetId: editor._id },
    message: `Accepted access for editor "${editor.fullName}".`,
  });

  res.json({ message: 'Editor accepted.', editor: { id: editor._id, fullName: editor.fullName } });
});

/**
 * POST /api/editors/:id/revoke — Admin only.
 * The ONLY negative action available on a pending editor. Permanently
 * deletes the pending request (per spec: revoke = delete, not a status flag).
 */
const revokeEditor = asyncHandler(async (req, res) => {
  const pending = await PendingEditor.findById(req.params.id);
  if (!pending) return res.status(404).json({ error: 'Pending request not found.' });

  await pending.deleteOne();

  await logActivity({
    actor: { id: req.user.id, role: 'Admin', name: req.user.name, action: 'editor.revoked', targetType: 'PendingEditor', targetId: req.params.id },
    message: `Revoked access request from "${pending.fullName}".`,
  });

  res.json({ message: 'Access revoked and request deleted.' });
});

/** DELETE /api/editors/:id — Admin only. Removes an already-active editor account. */
const deleteEditor = asyncHandler(async (req, res) => {
  const editor = await Editor.findById(req.params.id);
  if (!editor) return res.status(404).json({ error: 'Editor not found.' });

  await editor.deleteOne();

  await logActivity({
    actor: { id: req.user.id, role: 'Admin', name: req.user.name, action: 'editor.deleted', targetType: 'Editor', targetId: editor._id },
    message: `Deleted editor account "${editor.fullName}".`,
  });

  res.json({ message: 'Editor deleted.' });
});

/** GET /api/editors/:id/analytics — Editor sees only their own; Admin can view any. */
const editorAnalytics = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
    return res.status(403).json({ error: 'You can only view your own analytics.' });
  }
  const posts = await Post.find({ author: req.params.id });
  const totals = posts.reduce(
    (acc, p) => ({
      views: acc.views + p.views,
      likes: acc.likes + p.likes,
      comments: acc.comments + p.commentCount,
    }),
    { views: 0, likes: 0, comments: 0 }
  );
  res.json({ postCount: posts.length, ...totals, posts: posts.map(p => ({ id: p._id, title: p.title, views: p.views, status: p.status })) });
});

module.exports = { listPending, listActive, acceptEditor, revokeEditor, deleteEditor, editorAnalytics, getPublicEditor };
