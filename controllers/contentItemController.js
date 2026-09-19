const ContentItem = require('../models/ContentItem');
const asyncHandler = require('../utils/asyncHandler');
const logActivity = require('../utils/logActivity');
const { sanitizePlainText } = require('../utils/sanitizeContent');

const TYPES = ['video', 'slide', 'event', 'team'];

/** Maps a ContentItem doc to the flat shape the admin UI expects. */
function toUiShape(doc) {
  const d = doc.data instanceof Map ? Object.fromEntries(doc.data) : doc.data || {};
  return {
    id: doc._id,
    type: doc.type,
    title: doc.title,
    status: doc.status,
    featured: doc.featured,
    source: d.source || '',
    url: d.url || '',
    kind: d.kind || '',
    date: d.date || '',
    location: d.location || '',
    link: d.link || '',
    role: d.role || '',
    img: d.img || '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** GET /api/content-items?type=video — public: published only; admin: all. */
const list = asyncHandler(async (req, res) => {
  const type = TYPES.includes(req.query.type) ? req.query.type : null;
  if (req.user && (req.user.role === 'admin' || req.user.role === 'editor')) {
    const q = type ? { type } : {};
    const all = await ContentItem.find(q).sort('-createdAt');
    return res.json(all.map(toUiShape));
  }
  const q = { status: 'published' };
  if (type) q.type = type;
  const pub = await ContentItem.find(q).sort('-createdAt');
  res.json(pub.map(toUiShape));
});

/** POST /api/content-items — admin only. */
const create = asyncHandler(async (req, res) => {
  const { type, title, status, featured, ...rest } = req.body;
  if (!TYPES.includes(type)) return res.status(400).json({ error: 'Unknown content type.' });
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required.' });

  const data = {};
  for (const k of ['source', 'url', 'kind', 'date', 'location', 'link', 'role', 'img']) {
    if (rest[k]) data[k] = sanitizePlainText(String(rest[k])).slice(0, 500);
  }

  const item = await ContentItem.create({
    type,
    title: sanitizePlainText(title),
    status: ['draft', 'published', 'scheduled', 'cancelled', 'archived'].includes(status) ? status : 'published',
    featured: Boolean(featured),
    data,
    createdBy: req.user.id,
  });

  await logActivity({
    actor: { id: req.user.id, role: req.user.role, name: req.user.name, action: 'content.created', targetType: 'ContentItem', targetId: item._id },
    message: `Created ${type} "${item.title}".`,
  });

  res.status(201).json(toUiShape(item));
});

/** PUT /api/content-items/:id — admin only. */
const update = asyncHandler(async (req, res) => {
  const item = await ContentItem.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });

  const { title, status, featured, ...rest } = req.body;
  if (title !== undefined) item.title = sanitizePlainText(title) || item.title;
  if (status !== undefined && ['draft', 'published', 'scheduled', 'cancelled', 'archived'].includes(status)) item.status = status;
  if (featured !== undefined) item.featured = Boolean(featured);

  const map = item.data instanceof Map ? item.data : new Map(Object.entries(item.data || {}));
  for (const k of ['source', 'url', 'kind', 'date', 'location', 'link', 'role', 'img']) {
    if (rest[k] !== undefined) map.set(k, sanitizePlainText(String(rest[k])).slice(0, 500));
  }
  item.data = map;
  item.markModified('data');
  await item.save();

  await logActivity({
    actor: { id: req.user.id, role: req.user.role, name: req.user.name, action: 'content.updated', targetType: 'ContentItem', targetId: item._id },
    message: `Updated ${item.type} "${item.title}".`,
  });

  res.json(toUiShape(item));
});

/** DELETE /api/content-items/:id — admin only. */
const remove = asyncHandler(async (req, res) => {
  const item = await ContentItem.findByIdAndDelete(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  await logActivity({
    actor: { id: req.user.id, role: req.user.role, name: req.user.name, action: 'content.deleted', targetType: 'ContentItem', targetId: item._id },
    message: `Deleted ${item.type} "${item.title}".`,
  });
  res.json({ message: 'Deleted.' });
});

module.exports = { list, create, update, remove };
