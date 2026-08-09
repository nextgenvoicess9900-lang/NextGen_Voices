const express = require('express');
const ctrl = require('../controllers/settingsController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { doubleCsrfProtection } = require('../middleware/csrf');

const router = express.Router();

router.get('/', ctrl.getSettings); // public
router.put('/', authenticate, authorize('admin'), doubleCsrfProtection, ctrl.updateSettings);

module.exports = router;
