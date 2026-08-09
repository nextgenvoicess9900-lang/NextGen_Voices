const mongoose = require('mongoose');

/**
 * Post — the single content model behind both "Content Management" (admin
 * dashboard) and the public Explore feed. `contentType` determines which
 * card layout the frontend renders and which optional metadata block
 * (`opportunityMeta` / `researchMeta`) is relevant. `authorRole` is
 * denormalized so the ownership check in middleware doesn't need an extra
 * population query.
 */
const CONTENT_TYPES = [
  'article', 'image', 'carousel', 'video', 'reel',
  'research', 'opportunity', 'pdf', 'announcement',
  'scholarship', 'competition', 'news', 'event',
];

const linkItemSchema = new mongoose.Schema({ label: { type: String, trim: true }, url: { type: String, trim: true } }, { _id: false });
const faqItemSchema = new mongoose.Schema({ question: { type: String, trim: true }, answer: { type: String, trim: true } }, { _id: false });
const speakerItemSchema = new mongoose.Schema({ name: { type: String, trim: true }, title: { type: String, trim: true }, bio: { type: String, trim: true } }, { _id: false });
const agendaItemSchema = new mongoose.Schema({ time: { type: String, trim: true }, item: { type: String, trim: true } }, { _id: false });

const mediaItemSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['image', 'video', 'pdf'], required: true },
    url: { type: String, required: true },
    thumbnail: { type: String }, // used for video/pdf covers
  },
  { _id: false }
);

const interactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userRole: { type: String, enum: ['Admin', 'Editor', 'Viewer'], required: true },
  },
  { _id: false }
);

const postSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    contentType: { type: String, enum: CONTENT_TYPES, default: 'article' },
    content: { type: String, required: true }, // sanitized HTML/markdown, see utils/sanitizeContent.js
    excerpt: { type: String, trim: true },
    coverImage: { type: String, default: '' },
    media: [mediaItemSchema], // carousel images, a video file, a reel, a PDF...
    tags: [{ type: String, trim: true }],
    categories: [{ type: String, trim: true }],
    seo: {
      title: { type: String, trim: true },
      description: { type: String, trim: true },
      keywords: [{ type: String, trim: true }],
    },

    // Only populated when contentType === 'opportunity'
    opportunityMeta: {
      deadline: { type: Date },
      country: { type: String, trim: true },
      eligibility: { type: String, trim: true },
      funding: { type: String, trim: true },
      mode: { type: String, enum: ['online', 'offline', 'hybrid'], default: 'online' },
    },
    // Only populated when contentType === 'research'
    researchMeta: {
      institution: { type: String, trim: true },
      field: { type: String, trim: true },
      abstract: { type: String, trim: true },
    },
    // Only populated when contentType === 'scholarship'
    scholarshipMeta: {
      organization: { type: String, trim: true },
      country: { type: String, trim: true },
      eligibility: { type: String, trim: true },
      benefits: { type: String, trim: true },
      applicationDeadline: { type: Date },
      officialWebsite: { type: String, trim: true },
      applicationLink: { type: String, trim: true },
      documentsRequired: [{ type: String, trim: true }],
      faq: [faqItemSchema],
    },
    // Only populated when contentType === 'competition'
    competitionMeta: {
      organizer: { type: String, trim: true },
      eligibility: { type: String, trim: true },
      prize: { type: String, trim: true },
      registrationDeadline: { type: Date },
      eventDate: { type: Date },
      officialWebsite: { type: String, trim: true },
      rules: { type: String, trim: true },
      resources: [linkItemSchema],
    },
    // Only populated when contentType === 'news'
    newsMeta: {
      source: { type: String, trim: true },
      references: [linkItemSchema],
      relatedLinks: [linkItemSchema],
    },
    // Only populated when contentType === 'event'
    eventMeta: {
      date: { type: Date },
      time: { type: String, trim: true },
      venue: { type: String, trim: true },
      registrationLink: { type: String, trim: true },
      speakers: [speakerItemSchema],
      agenda: [agendaItemSchema],
    },

    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    featured: { type: Boolean, default: false },
    // Blog has no separate contentType from Article (same schema/rendering) —
    // this flag is the one durable signal that distinguishes them, so the
    // composer can restore the right labels/copy on edit without inferring
    // it from a category tag that could be renamed or removed.
    isBlog: { type: Boolean, default: false },
    author: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'authorRole' },
    authorRole: { type: String, enum: ['Admin', 'Editor'], required: true },

    views: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    readingTime: { type: Number, default: 1 }, // minutes, auto-computed on save

    likedBy: [interactionSchema],
    bookmarkedBy: [interactionSchema],
    likeCount: { type: Number, default: 0 },
    bookmarkCount: { type: Number, default: 0 },

    publishedAt: { type: Date },
  },
  { timestamps: true }
);

postSchema.index({ title: 'text', excerpt: 'text', content: 'text', tags: 'text', categories: 'text' });
postSchema.index({ status: 1, contentType: 1, publishedAt: -1 });

// Auto-compute reading time (~200 words/min) from plain-text content length.
postSchema.pre('save', function (next) {
  if (this.isModified('content')) {
    const words = this.content.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
    this.readingTime = Math.max(1, Math.round(words / 200));
  }
  next();
});

postSchema.statics.CONTENT_TYPES = CONTENT_TYPES;

module.exports = mongoose.model('Post', postSchema);
