const express = require('express');
const ctrl = require('../controllers/analyticsController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

const router = express.Router();

router.get('/overview', authenticate, authorize('admin'), ctrl.overview);

module.exports = router;
