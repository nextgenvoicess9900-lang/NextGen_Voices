const mongoose = require('mongoose');

/**
 * ActivityLog — immutable audit trail. Entries are created by controllers
 * (never directly by clients) so the log can be trusted for security review.
 */
const activityLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'actorRole' },
    actorRole: { type: String, enum: ['Admin', 'Editor'], required: true },
    actorName: { type: String, required: true },
    action: { type: String, required: true }, // e.g. "post.created", "editor.accepted"
    targetType: { type: String },
    targetId: { type: mongoose.Schema.Types.ObjectId },
    message: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ActivityLog', activityLogSchema);
