const mongoose = require('mongoose');

/**
 * ContentItem — durable, DB-backed storage for the admin sections that were
 * previously localStorage-only (Videos, Slides, Events, Team/Posters come
 * later if needed). A single flexible model keeps the admin CRUD surface
 * small: `type` discriminates the section, `data` holds the type-specific
 * fields, `status` mirrors the existing draft/published badges.
 */
const contentItemSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ['video', 'slide', 'event', 'team'],
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    status: { type: String, enum: ['draft', 'published', 'scheduled', 'cancelled', 'archived'], default: 'published' },
    featured: { type: Boolean, default: false },
    data: {
      // video: { source, url } · slide: { kind, url } · event: { date, location, link } · team: { role, img }
      type: Map,
      of: String,
      default: {},
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ContentItem', contentItemSchema);
