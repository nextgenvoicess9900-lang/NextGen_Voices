const express = require('express');
const ctrl = require('../controllers/searchController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

const router = express.Router();

router.get('/', authenticate, authorize('admin', 'editor'), ctrl.globalSearch);

module.exports = router;
