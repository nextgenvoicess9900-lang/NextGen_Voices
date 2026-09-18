const express = require('express');
const ctrl = require('../controllers/directusController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

const router = express.Router();

// Directus is an admin-level data browsing tool (it exposes the whole
// underlying database), so every route is locked to the Admin role. The
// DIRECTUS_TOKEN never leaves the server — the browser only ever talks to
// these proxied endpoints, exactly like every other API call in this app.
router.get('/status', authenticate, authorize('admin'), ctrl.getStatus);
router.get('/collections', authenticate, authorize('admin'), ctrl.listCollections);
router.get('/collections/:collection/items', authenticate, authorize('admin'), ctrl.listItems);

module.exports = router;
