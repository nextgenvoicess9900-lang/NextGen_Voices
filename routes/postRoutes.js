const express = require('express');
const { body } = require('express-validator');
const ctrl = require('../controllers/postController');
const authenticate = require('../middleware/authenticate');
const { authorize, authorizeOwnerOrAdmin } = require('../middleware/authorize');
const { doubleCsrfProtection } = require('../middleware/csrf');
const validate = require('../middleware/validate');

const router = express.Router();

// ---- Public: Explore feed, search, suggestions ----
// (must be declared before the "/:id" catch-all route below)
router.get('/explore', ctrl.explore);
router.get('/explore/stats', ctrl.exploreStats);
router.get('/suggest', ctrl.suggest);
router.get('/', ctrl.listPublished);

// ---- Admin/Editor ----
router.get('/mine/list', authenticate, authorize('admin', 'editor'), ctrl.listMine);
router.get('/admin/all', authenticate, authorize('admin'), ctrl.listAll);

// ---- Any logged-in role: bookmarks ----
router.get('/bookmarks/mine', authenticate, authorize('admin', 'editor', 'viewer'), ctrl.listMyBookmarks);

// ---- Viewer only: personalized recommendation feed ----
router.get('/for-you', authenticate, authorize('viewer'), ctrl.forYou);

router.post(
  '/',
  authenticate,
  authorize('admin', 'editor'),
  doubleCsrfProtection,
  [body('title').trim().notEmpty(), body('content').notEmpty()],
  validate,
  ctrl.createPost
);

// ---- Public (with optional identity) — must come after the specific GET routes above ----
router.get('/:id', authenticate.authenticateOptional, ctrl.getPost);

router.put(
  '/:id',
  authenticate,
  authorize('admin', 'editor'),
  ctrl.loadPostForOwnerCheck,
  authorizeOwnerOrAdmin((req) => req.loadedPost.author),
  doubleCsrfProtection,
  ctrl.updatePost
);

router.delete(
  '/:id',
  authenticate,
  authorize('admin', 'editor'),
  ctrl.loadPostForOwnerCheck,
  authorizeOwnerOrAdmin((req) => req.loadedPost.author),
  doubleCsrfProtection,
  ctrl.deletePost
);

// ---- Any logged-in role: like / bookmark ----
router.post('/:id/like', authenticate, authorize('admin', 'editor', 'viewer'), doubleCsrfProtection, ctrl.toggleLike);
router.post('/:id/bookmark', authenticate, authorize('admin', 'editor', 'viewer'), doubleCsrfProtection, ctrl.toggleBookmark);

module.exports = router;
