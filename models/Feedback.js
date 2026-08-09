const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    workshop: { type: mongoose.Schema.Types.ObjectId, ref: 'Workshop', required: true },
    viewer: { type: mongoose.Schema.Types.ObjectId, ref: 'Viewer', required: true },

    ratings: {
      content: { type: Number, min: 1, max: 5 },
      speaker: { type: Number, min: 1, max: 5 },
      presentation: { type: Number, min: 1, max: 5 },
      interaction: { type: Number, min: 1, max: 5 },
      resources: { type: Number, min: 1, max: 5 },
      assessment: { type: Number, min: 1, max: 5 },
      overall: { type: Number, min: 1, max: 5, required: true },
    },
    suggestion: { type: String, trim: true, maxlength: 1000 },
    recommend: { type: Boolean },
    anonymous: { type: Boolean, default: false },
  },
  { timestamps: true }
);

feedbackSchema.index({ workshop: 1, viewer: 1 }, { unique: true }); // one feedback per viewer per workshop, upserted

module.exports = mongoose.model('Feedback', feedbackSchema);
