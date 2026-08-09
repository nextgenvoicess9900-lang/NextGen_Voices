const slugify = require('slugify');
const Post = require('../models/Post');
const Viewer = require('../models/Viewer');
const asyncHandler = require('../utils/asyncHandler');
const logActivity = require('../utils/logActivity');
const { sanitizeRichText, sanitizePlainText } = require('../utils/sanitizeContent');

/**
 * GET /api/posts/explore/stats — public. Powers the Explore page's live
 * statistics strip: a count + "today" delta per content-type bucket, plus
 * total community size. Cheap aggregate queries, fine to call on every
 * Explore page load (no caching layer yet — add one if traffic grows).
 */
const exploreStats = asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const buckets = [
    { key: 'research', label: 'Research Articles', match: { contentType: 'research' } },
    { key: 'opportunity', label: 'Opportunities', match: { contentType: 'opportunity' } },
    { key: 'reel', label: 'Educational Reels', match: { contentType: { $in: ['reel', 'video'] } } },
    { key: 'article', label: 'Articles', match: { contentType: { $in: ['article', 'announcement', 'pdf', 'image', 'carousel'] } } },
  ];

  const results = await Promise.all(buckets.map(async b => {
    const filter = { status: 'published', ...b.match };
    const [total, today] = await Promise.all([
      Post.countDocuments(filter),
      Post.countDocuments({ ...filter, publishedAt: { $gte: since } }),
    ]);
    return { key: b.key, label: b.label, total, today };
  }));

  const [memberCount, membersToday] = await Promise.all([
    Viewer.countDocuments(),
    Viewer.countDocuments({ createdAt: { $gte: since } }),
  ]);

  res.json({
    buckets: results,
    community: { total: memberCount, today: membersToday },
  });
});

/**
 * Lightweight synonym expansion for "smart search" — maps a handful of
 * common abbreviations/related terms so "AI" also matches "Artificial
 * Intelligence", "Machine Learning", etc. Not NLP, just a practical
 * starting point; extend this table as real query logs come in.
 */
const SYNONYMS = {
  ai: ['artificial intelligence', 'machine learning', 'deep learning', 'neural network'],
  ml: ['machine learning', 'artificial intelligence'],
  scholarship: ['funding', 'grant', 'financial aid'],
  internship: ['traineeship', 'apprenticeship'],
  space: ['astronomy', 'aerospace', 'nasa'],
  startup: ['entrepreneurship', 'venture', 'founder'],
  gov: ['government', 'scheme', 'policy'],
};
function expandQuery(q) {
  const lower = q.toLowerCase().trim();
  const extra = SYNONYMS[lower] || [];
  return [lower, ...extra];
}

/**
 * GET /api/posts/explore — public. The Explore feed: full-text-ish search,
 * category/type filters, sort modes, and pagination. Kept separate from
 * `listPublished` (used by simpler listings) so Explore's richer query
 * surface doesn't complicate the basic case.
 */
const explore = asyncHandler(async (req, res) => {
  const { q, category, contentType, tag, tags, sort = 'newest', page = 1, limit = 12 } = req.query;
  const filter = { status: 'published' };
  if (category) filter.categories = category;
  if (contentType) filter.contentType = contentType;
  if (tag) filter.tags = tag; // exact match against the tags array — powers /tag/:name pages
  if (tags) filter.tags = { $in: tags.split(',').map(t => t.trim()).filter(Boolean) }; // powers the Following tab (multiple followed hashtags)

  if (q && q.trim()) {
    const terms = expandQuery(q.trim());
    const regexes = terms.map(t => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    filter.$or = regexes.flatMap(r => ([
      { title: r }, { excerpt: r }, { tags: r }, { categories: r },
      { 'researchMeta.field': r }, { 'researchMeta.institution': r }, { 'opportunityMeta.country': r },
    ]));
  }

  const sortMap = {
    newest: { publishedAt: -1 },
    trending: { views: -1, publishedAt: -1 }, // simple proxy for "trending" without a time-decay job
    mostViewed: { views: -1 },
    mostLiked: { likeCount: -1, views: -1 },
    featured: { featured: -1, publishedAt: -1 },
  };

  const posts = await Post.find(filter)
    .select('-content')
    .populate('author', 'fullName name publicDisplayName professionalTitle profilePhoto tagline areasOfExpertise username')
    .sort(sortMap[sort] || sortMap.newest)
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();

  const shaped = posts.map(p => ({
    ...p,
    likedBy: undefined,
    bookmarkedBy: undefined,
  }));

  const total = await Post.countDocuments(filter);
  res.json({ posts: shaped, total, page: Number(page), hasMore: page * limit < total });
});

/**
 * GET /api/posts/suggest?q= — public, lightweight autocomplete. Returns a
 * short mixed list (titles, categories, tags) for the search-as-you-type
 * dropdown. Debounced on the frontend, not here.
 */
const suggest = asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) return res.json([]);
  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  const [titleMatches, categoryMatches, tagMatches] = await Promise.all([
    Post.find({ status: 'published', title: regex }).select('title contentType').limit(5).lean(),
    Post.distinct('categories', { status: 'published', categories: regex }),
    Post.distinct('tags', { status: 'published', tags: regex }),
  ]);

  const suggestions = [
    ...titleMatches.map(p => ({ type: p.contentType, label: p.title, kind: 'post', id: p._id })),
    ...categoryMatches.slice(0, 4).map(c => ({ type: 'category', label: c, kind: 'category' })),
    ...tagMatches.slice(0, 4).map(t => ({ type: 'tag', label: t, kind: 'tag' })),
  ].slice(0, 10);

  res.json(suggestions);
});

/** GET /api/posts — public, published only, supports basic pagination + filters. */
const listPublished = asyncHandler(async (req, res) => {
  const { page = 1, limit = 12, tag, category } = req.query;
  const filter = { status: 'published' };
  if (tag) filter.tags = tag;
  if (category) filter.categories = category;

  const posts = await Post.find(filter)
    .select('-content')
    .sort('-publishedAt')
    .skip((page - 1) * limit)
    .limit(Number(limit));
  const total = await Post.countDocuments(filter);
  res.json({ posts, total, page: Number(page) });
});

/** GET /api/posts/:id — public for published; Admin/Editor(owner) for drafts. */
const getPost = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id).populate('author', 'fullName name publicDisplayName professionalTitle profilePhoto tagline areasOfExpertise username');
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  const isOwnerOrAdmin = req.user && (req.user.role === 'admin' || req.user.id === post.author._id.toString());
  if (post.status !== 'published' && !isOwnerOrAdmin) {
    return res.status(404).json({ error: 'Post not found.' });
  }
  if (post.status === 'published') {
    post.views += 1;
    await post.save();
    if (req.user && req.user.role === 'viewer') {
      // Capped, newest-first reading history — a real signal for For You,
      // not a fabricated one. Fire-and-forget-ish but awaited for simplicity.
      await Viewer.findByIdAndUpdate(req.user.id, {
        $push: { readingHistory: { $each: [{ post: post._id, viewedAt: new Date() }], $position: 0, $slice: 100 } },
      });
    }
  }
  const obj = post.toObject();
  obj.likeCount = post.likeCount;
  obj.bookmarkCount = post.bookmarkCount;
  if (req.user) {
    obj.likedByMe = post.likedBy.some(l => l.userId.toString() === req.user.id);
    obj.bookmarkedByMe = post.bookmarkedBy.some(b => b.userId.toString() === req.user.id);
  }
  res.json(obj);
});

/** GET /api/posts/mine — Editor/Admin, own posts including drafts. */
const listMine = asyncHandler(async (req, res) => {
  const posts = await Post.find({ author: req.user.id }).sort('-updatedAt');
  res.json(posts);
});

/** GET /api/posts/all — Admin only, every post regardless of author/status. */
const listAll = asyncHandler(async (req, res) => {
  const posts = await Post.find().sort('-updatedAt').populate('author', 'fullName username userId');
  res.json(posts);
});

/** POST /api/posts — Admin or Editor. Creates as draft unless `publish:true`. */
const createPost = asyncHandler(async (req, res) => {
  const {
    title, content, excerpt, coverImage, contentType = 'article', media = [],
    tags = [], categories = [], seo = {}, opportunityMeta, researchMeta,
    scholarshipMeta, competitionMeta, newsMeta, eventMeta, featured, isBlog, publish,
  } = req.body;

  const slugBase = slugify(title, { lower: true, strict: true });
  let slug = slugBase;
  let n = 1;
  while (await Post.exists({ slug })) { slug = `${slugBase}-${n++}`; }

  const post = await Post.create({
    title: sanitizePlainText(title),
    slug,
    contentType,
    content: sanitizeRichText(content),
    excerpt: sanitizePlainText(excerpt),
    coverImage,
    media,
    tags: tags.map(sanitizePlainText),
    categories: categories.map(sanitizePlainText),
    seo: {
      title: sanitizePlainText(seo.title || title),
      description: sanitizePlainText(seo.description || excerpt),
      keywords: (seo.keywords || []).map(sanitizePlainText),
    },
    opportunityMeta: contentType === 'opportunity' ? opportunityMeta : undefined,
    researchMeta: contentType === 'research' ? researchMeta : undefined,
    scholarshipMeta: contentType === 'scholarship' ? scholarshipMeta : undefined,
    competitionMeta: contentType === 'competition' ? competitionMeta : undefined,
    newsMeta: contentType === 'news' ? newsMeta : undefined,
    eventMeta: contentType === 'event' ? eventMeta : undefined,
    featured: !!featured,
    isBlog: contentType === 'article' ? !!isBlog : false,
    status: publish ? 'published' : 'draft',
    publishedAt: publish ? new Date() : undefined,
    author: req.user.id,
    authorRole: req.user.role === 'admin' ? 'Admin' : 'Editor',
  });

  await logActivity({
    actor: { id: req.user.id, role: req.user.role === 'admin' ? 'Admin' : 'Editor', name: req.user.name, action: 'post.created', targetType: 'Post', targetId: post._id },
    message: `${publish ? 'Published' : 'Saved draft of'} ${contentType} "${post.title}".`,
  });

  res.status(201).json(post);
});

/**
 * PUT /api/posts/:id — Admin (any post) or the owning Editor only.
 * Ownership is enforced by `authorizeOwnerOrAdmin` in the route, which
 * needs the loaded document — so this loads it once and passes it along.
 */
const updatePost = asyncHandler(async (req, res) => {
  const post = req.loadedPost; // attached by the ownership-check middleware
  const {
    title, content, excerpt, coverImage, contentType, media,
    tags, categories, seo, opportunityMeta, researchMeta,
    scholarshipMeta, competitionMeta, newsMeta, eventMeta, featured, isBlog, publish,
  } = req.body;

  if (title) { post.title = sanitizePlainText(title); }
  if (content) { post.content = sanitizeRichText(content); }
  if (excerpt !== undefined) post.excerpt = sanitizePlainText(excerpt);
  if (coverImage !== undefined) post.coverImage = coverImage;
  if (contentType) post.contentType = contentType;
  if (media) post.media = media;
  if (tags) post.tags = tags.map(sanitizePlainText);
  if (categories) post.categories = categories.map(sanitizePlainText);
  if (opportunityMeta) post.opportunityMeta = opportunityMeta;
  if (researchMeta) post.researchMeta = researchMeta;
  if (scholarshipMeta) post.scholarshipMeta = scholarshipMeta;
  if (competitionMeta) post.competitionMeta = competitionMeta;
  if (newsMeta) post.newsMeta = newsMeta;
  if (eventMeta) post.eventMeta = eventMeta;
  if (typeof featured === 'boolean') post.featured = featured;
  if (typeof isBlog === 'boolean') post.isBlog = isBlog;
  if (seo) {
    post.seo = {
      title: sanitizePlainText(seo.title || post.seo.title),
      description: sanitizePlainText(seo.description || post.seo.description),
      keywords: (seo.keywords || post.seo.keywords || []).map(sanitizePlainText),
    };
  }
  if (typeof publish === 'boolean') {
    post.status = publish ? 'published' : 'draft';
    if (publish && !post.publishedAt) post.publishedAt = new Date();
  }

  await post.save();

  await logActivity({
    actor: { id: req.user.id, role: req.user.role === 'admin' ? 'Admin' : 'Editor', name: req.user.name, action: 'post.updated', targetType: 'Post', targetId: post._id },
    message: `Updated post "${post.title}".`,
  });

  res.json(post);
});

/** DELETE /api/posts/:id — Admin (any) or owning Editor. */
const deletePost = asyncHandler(async (req, res) => {
  const post = req.loadedPost;
  await post.deleteOne();

  await logActivity({
    actor: { id: req.user.id, role: req.user.role === 'admin' ? 'Admin' : 'Editor', name: req.user.name, action: 'post.deleted', targetType: 'Post', targetId: post._id },
    message: `Deleted post "${post.title}".`,
  });

  res.json({ message: 'Post deleted.' });
});

/** POST /api/posts/:id/like — any logged-in role. Toggles like. */
const toggleLike = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const roleLabel = req.user.role === 'admin' ? 'Admin' : req.user.role === 'editor' ? 'Editor' : 'Viewer';
  const idx = post.likedBy.findIndex(l => l.userId.toString() === req.user.id);
  if (idx >= 0) post.likedBy.splice(idx, 1);
  else post.likedBy.push({ userId: req.user.id, userRole: roleLabel });
  post.likeCount = post.likedBy.length;
  await post.save();
  res.json({ liked: idx < 0, likeCount: post.likeCount });
});

/** POST /api/posts/:id/bookmark — any logged-in role. Toggles bookmark. */
const toggleBookmark = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const roleLabel = req.user.role === 'admin' ? 'Admin' : req.user.role === 'editor' ? 'Editor' : 'Viewer';
  const idx = post.bookmarkedBy.findIndex(b => b.userId.toString() === req.user.id);
  if (idx >= 0) post.bookmarkedBy.splice(idx, 1);
  else post.bookmarkedBy.push({ userId: req.user.id, userRole: roleLabel });
  post.bookmarkCount = post.bookmarkedBy.length;
  await post.save();
  res.json({ bookmarked: idx < 0, bookmarkCount: post.bookmarkCount });
});

/** GET /api/posts/bookmarks/mine — any logged-in role. */
const listMyBookmarks = asyncHandler(async (req, res) => {
  const posts = await Post.find({ 'bookmarkedBy.userId': req.user.id, status: 'published' })
    .select('-content')
    .sort('-publishedAt');
  res.json(posts);
});

/**
 * GET /api/posts/for-you — viewer only.
 * A real weighted-scoring recommendation, not a fabricated ranking:
 *   40% overlap with the viewer's declared interests
 *   25% overlap with tags/categories from their reading history
 *   15% overlap with tags from posts they've bookmarked
 *   10% overlap with tags from posts they've liked ("appreciated")
 *    5% overlap with hashtags they explicitly follow
 *    5% trending (normalized view count within the candidate pool)
 * If the viewer has no interests/follows/history yet, the score collapses
 * to mostly the trending term — `personalized:false` tells the frontend
 * that honestly rather than pretending otherwise.
 */
const forYou = asyncHandler(async (req, res) => {
  const { page = 1, limit = 12 } = req.query;
  const viewer = await Viewer.findById(req.user.id).populate('readingHistory.post', 'tags categories');
  if (!viewer) return res.status(404).json({ error: 'Account not found.' });

  const lower = arr => (arr || []).map(s => String(s).toLowerCase());
  const interestSet = new Set(lower(viewer.interests));
  const followedSet = new Set(lower(viewer.followedHashtags));
  const historyPosts = (viewer.readingHistory || []).map(h => h.post).filter(Boolean);
  const historyTagSet = new Set(historyPosts.flatMap(p => lower([...(p.tags || []), ...(p.categories || [])])));

  const [likedPosts, bookmarkedPosts] = await Promise.all([
    Post.find({ 'likedBy.userId': req.user.id, status: 'published' }).select('tags'),
    Post.find({ 'bookmarkedBy.userId': req.user.id, status: 'published' }).select('tags'),
  ]);
  const likedTagSet = new Set(likedPosts.flatMap(p => lower(p.tags)));
  const bookmarkedTagSet = new Set(bookmarkedPosts.flatMap(p => lower(p.tags)));

  const personalized = interestSet.size > 0 || followedSet.size > 0 || historyTagSet.size > 0 || likedTagSet.size > 0 || bookmarkedTagSet.size > 0;

  // Candidate pool: recent published posts. 300 is a pragmatic ceiling for
  // in-process scoring without needing a search index for this.
  const candidates = await Post.find({ status: 'published' })
    .select('-content')
    .populate('author', 'fullName name publicDisplayName professionalTitle profilePhoto tagline areasOfExpertise username')
    .sort('-publishedAt')
    .limit(300)
    .lean();

  const maxViews = Math.max(1, ...candidates.map(p => p.views || 0));
  const overlapRatio = (postTags, refSet) => {
    if (!postTags || !postTags.length || !refSet.size) return 0;
    const hits = postTags.filter(t => refSet.has(String(t).toLowerCase())).length;
    return hits / postTags.length;
  };

  const scored = candidates.map(p => {
    const tags = p.tags || [];
    const interestScore = overlapRatio(tags, interestSet);
    const historyScore = overlapRatio([...tags, ...(p.categories || [])], historyTagSet);
    const bookmarkScore = overlapRatio(tags, bookmarkedTagSet);
    const likeScore = overlapRatio(tags, likedTagSet);
    const followedScore = overlapRatio(tags, followedSet);
    const trendingScore = (p.views || 0) / maxViews;
    const score = 0.40 * interestScore + 0.25 * historyScore + 0.15 * bookmarkScore
                + 0.10 * likeScore + 0.05 * followedScore + 0.05 * trendingScore;
    return { ...p, likedBy: undefined, bookmarkedBy: undefined, _score: score };
  }).sort((a, b) => b._score - a._score);

  const start = (page - 1) * limit;
  const pageItems = scored.slice(start, start + Number(limit));
  res.json({ posts: pageItems, total: scored.length, page: Number(page), hasMore: start + Number(limit) < scored.length, personalized });
});

/** Loader middleware used by update/delete routes to fetch the post once and expose it for the ownership check. */
const loadPostForOwnerCheck = asyncHandler(async (req, res, next) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  req.loadedPost = post;
  next();
});

module.exports = {
  explore, suggest, exploreStats, listPublished, getPost, listMine, listAll,
  createPost, updatePost, deletePost, loadPostForOwnerCheck,
  toggleLike, toggleBookmark, listMyBookmarks, forYou,
};
