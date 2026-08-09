const express = require('express');
const ctrl = require('../controllers/registrationController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

const router = express.Router();

router.get('/mine', authenticate, authorize('viewer'), ctrl.listMyRegistrations);

module.exports = router;
