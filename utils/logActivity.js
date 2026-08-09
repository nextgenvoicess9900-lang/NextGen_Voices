const ActivityLog = require('../models/ActivityLog');

/**
 * Records an audit-trail entry. Called from controllers after a state
 * change succeeds — never trust the client to report its own actions.
 */
async function logActivity({ actor, message }) {
  try {
    await ActivityLog.create({
      actor: actor.id,
      actorRole: actor.role,
      actorName: actor.name,
      action: actor.action,
      targetType: actor.targetType,
      targetId: actor.targetId,
      message,
    });
  } catch (err) {
    // Logging must never break the primary request.
    console.error('[activity-log] failed to write entry:', err.message);
  }
}

module.exports = logActivity;
