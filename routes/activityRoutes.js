const express = require('express');
const ctrl = require('../controllers/activityController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

const router = express.Router();

router.get('/', authenticate, authorize('admin'), ctrl.listActivity);

module.exports = router;
