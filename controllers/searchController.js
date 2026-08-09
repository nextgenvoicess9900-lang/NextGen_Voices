const Post = require('../models/Post');
const Editor = require('../models/Editor');
const Question = require('../models/Question');
const Announcement = require('../models/Announcement');
const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');

/**
 * GET /api/search?q=... — Admin/Editor global search across the resources
 * the caller is allowed to see. Editors never see other editors' drafts
 * or the editor roster itself.
 */
const globalSearch = asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ posts: [], editors: [], questions: [], announcements: [], notifications: [] });

  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); // escape user input

  const postFilter = req.user.role === 'admin' ? { title: regex } : { title: regex, author: req.user.id };

  const [posts, questions, announcements, notifications, editors] = await Promise.all([
    Post.find(postFilter).select('title status updatedAt').limit(10),
    Post ? Question.find({ question: regex }).select('question status').limit(10) : [],
    Announcement.find({ title: regex }).select('title status').limit(10),
    Notification.find({ title: regex }).select('title priority').limit(10),
    req.user.role === 'admin' ? Editor.find({ fullName: regex }).select('fullName username').limit(10) : [],
  ]);

  res.json({ posts, questions, announcements, notifications, editors });
});

module.exports = { globalSearch };
