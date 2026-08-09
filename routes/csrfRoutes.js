const express = require('express');
const { generateCsrfToken } = require('../middleware/csrf');

const router = express.Router();

/**
 * GET /api/csrf-token — the frontend calls this once on load (before any
 * login form is submitted) to receive a token it must echo back in the
 * `x-csrf-token` header on every POST/PUT/DELETE.
 */
router.get('/', (req, res) => {
  const token = generateCsrfToken(req, res);
  res.json({ csrfToken: token });
});

module.exports = router;
