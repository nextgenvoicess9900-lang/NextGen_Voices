const express = require('express');
const { body } = require('express-validator');
const ctrl = require('../controllers/questionController');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { questionLimiter } = require('../middleware/rateLimiters');
const { doubleCsrfProtection } = require('../middleware/csrf');
const validate = require('../middleware/validate');

const router = express.Router();

// Public — no login required, intentionally anonymous.
router.post(
  '/',
  questionLimiter,
  [body('question').trim().isLength({ min: 3, max: 1000 })],
  validate,
  ctrl.submitQuestion
);

// Admin/Editor.
router.get('/', authenticate, authorize('admin', 'editor'), ctrl.listQuestions);
router.post('/:id/answer', authenticate, authorize('admin', 'editor'), doubleCsrfProtection, ctrl.answerQuestion);
router.put('/:id/status', authenticate, authorize('admin', 'editor'), doubleCsrfProtection, ctrl.updateStatus);

// Admin only.
router.delete('/:id', authenticate, authorize('admin'), doubleCsrfProtection, ctrl.deleteQuestion);

module.exports = router;
