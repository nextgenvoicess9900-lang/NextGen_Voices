const express = require('express');
const ctrl = require('../controllers/attendanceController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { doubleCsrfProtection } = require('../middleware/csrf');

const router = express.Router();

router.post('/:id', authenticate, authorize('admin', 'editor'), doubleCsrfProtection, ctrl.markAttendance);

module.exports = router;
