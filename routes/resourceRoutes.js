const express = require('express');
const ctrl = require('../controllers/resourceController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { doubleCsrfProtection } = require('../middleware/csrf');

const router = express.Router();

router.delete('/:id', authenticate, authorize('admin', 'editor'), doubleCsrfProtection, ctrl.deleteResource);

module.exports = router;
