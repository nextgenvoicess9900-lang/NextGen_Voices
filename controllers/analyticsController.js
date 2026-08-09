const Post = require('../models/Post');
const Editor = require('../models/Editor');
const Question = require('../models/Question');

const asyncHandler = require('../utils/asyncHandler');

/** GET /api/analytics/overview — Admin only. */
const overview = asyncHandler(async (req, res) => {
  const [postCount, publishedCount, editorCount, questionCount, pendingQuestionCount] = await Promise.all([
    Post.countDocuments(),
    Post.countDocuments({ status: 'published' }),
    Editor.countDocuments(),
    Question.countDocuments(),
    Question.countDocuments({ status: 'pending' }),
  ]);

  const viewsAgg = await Post.aggregate([{ $group: { _id: null, totalViews: { $sum: '$views' }, totalLikes: { $sum: '$likes' } } }]);
  const { totalViews = 0, totalLikes = 0 } = viewsAgg[0] || {};

  const topPosts = await Post.find({ status: 'published' }).sort('-views').limit(5).select('title views likes author');

  const mostActiveEditors = await Post.aggregate([
    { $match: { authorRole: 'Editor' } },
    { $group: { _id: '$author', postCount: { $sum: 1 }, totalViews: { $sum: '$views' } } },
    { $sort: { postCount: -1 } },
    { $limit: 5 },
  ]);

  // Daily traffic proxy: posts published per day over the last 14 days.
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const dailyTraffic = await Post.aggregate([
    { $match: { publishedAt: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$publishedAt' } }, posts: { $sum: 1 }, views: { $sum: '$views' } } },
    { $sort: { _id: 1 } },
  ]);

  res.json({
    postCount, publishedCount, editorCount, questionCount, pendingQuestionCount,
    totalViews, totalLikes, topPosts, mostActiveEditors, dailyTraffic,
  });
});

module.exports = { overview };
