const express = require('express');
const ctrl = require('../controllers/assessmentController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { doubleCsrfProtection } = require('../middleware/csrf');

const router = express.Router();

router.use(authenticate, authorize('admin'));

router.put('/:id', doubleCsrfProtection, ctrl.updateQuestion);
router.delete('/:id', doubleCsrfProtection, ctrl.deleteQuestion);

module.exports = router;
