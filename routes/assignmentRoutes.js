const express = require('express');
const ctrl = require('../controllers/assignmentController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { doubleCsrfProtection } = require('../middleware/csrf');

const router = express.Router();

router.get('/mine', authenticate, authorize('editor'), ctrl.myAssignments);
router.post('/:id/accept', authenticate, authorize('editor'), doubleCsrfProtection, ctrl.acceptAssignment);
router.post('/:id/checklist', authenticate, authorize('admin', 'editor'), doubleCsrfProtection, ctrl.toggleChecklistItem);
router.delete('/:id', authenticate, authorize('admin'), doubleCsrfProtection, ctrl.removeAssignment);

module.exports = router;
