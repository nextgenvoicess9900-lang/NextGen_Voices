/**
 * Role gate — use after `authenticate`. Enforces the two-role model from
 * the spec: only 'admin' and 'editor' exist, and permissions are checked
 * here on the server, not just hidden in the UI.
 *
 * Usage: router.delete('/:id', authenticate, authorize('admin'), ctrl.remove)
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

/**
 * Ownership gate for resources editors may only modify if they own them
 * (their own posts). Admins bypass this check entirely.
 * `getOwnerId` extracts the owning user id from the loaded document.
 */
function authorizeOwnerOrAdmin(getOwnerId) {
  return (req, res, next) => {
    if (req.user.role === 'admin') return next();
    const ownerId = getOwnerId(req);
    if (ownerId && ownerId.toString() === req.user.id) return next();
    return res.status(403).json({ error: 'You can only modify your own content.' });
  };
}

module.exports = { authorize, authorizeOwnerOrAdmin };
