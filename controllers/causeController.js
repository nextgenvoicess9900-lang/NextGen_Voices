const slugify = require('slugify');
const Cause = require('../models/Cause');
const asyncHandler = require('../utils/asyncHandler');
const logActivity = require('../utils/logActivity');
const { sanitizePlainText, sanitizeRichText } = require('../utils/sanitizeContent');

/** GET /api/causes — public. Active causes, newest first. Powers the "Opportunities You Can Support" grid. */
const listActive = asyncHandler(async (req, res) => {
  const causes = await Cause.find({ active: true }).sort('-createdAt');
  res.json(causes);
});

/** GET /api/causes/featured — public. The single cause shown as "Opportunity of the Day". */
const getFeatured = asyncHandler(async (req, res) => {
  const cause = await Cause.findOne({ active: true, featured: true }).sort('-createdAt')
    || await Cause.findOne({ active: true }).sort('-createdAt'); // fall back to newest if nothing is explicitly featured
  res.json(cause);
});

/** GET /api/causes/:id — public. */
const getOne = asyncHandler(async (req, res) => {
  const cause = await Cause.findById(req.params.id);
  if (!cause) return res.status(404).json({ error: 'Cause not found.' });
  res.json(cause);
});

/** GET /api/causes/admin/all — admin. Includes inactive causes. */
const listAll = asyncHandler(async (req, res) => {
  const causes = await Cause.find().sort('-createdAt');
  res.json(causes);
});

/** POST /api/causes — admin only. */
const createCause = asyncHandler(async (req, res) => {
  const { title, description, category, coverImage, goalAmount, featured } = req.body;

  const slugBase = slugify(title, { lower: true, strict: true });
  let slug = slugBase;
  let n = 1;
  while (await Cause.exists({ slug })) { slug = `${slugBase}-${n++}`; }

  if (featured) {
    // Only one cause is "Opportunity of the Day" at a time.
    await Cause.updateMany({ featured: true }, { featured: false });
  }

  const cause = await Cause.create({
    title: sanitizePlainText(title),
    slug,
    description: sanitizeRichText(description),
    category: sanitizePlainText(category) || 'General',
    coverImage,
    goalAmount,
    featured: !!featured,
    createdBy: req.user.id,
  });

  await logActivity({
    actor: { id: req.user.id, role: 'Admin', name: req.user.name, action: 'cause.created', targetType: 'Cause', targetId: cause._id },
    message: `Created donation cause "${cause.title}".`,
  });

  res.status(201).json(cause);
});

/** PUT /api/causes/:id — admin only. */
const updateCause = asyncHandler(async (req, res) => {
  const cause = await Cause.findById(req.params.id);
  if (!cause) return res.status(404).json({ error: 'Cause not found.' });

  const { title, description, category, coverImage, goalAmount, featured, active } = req.body;
  if (title !== undefined) cause.title = sanitizePlainText(title);
  if (description !== undefined) cause.description = sanitizeRichText(description);
  if (category !== undefined) cause.category = sanitizePlainText(category);
  if (coverImage !== undefined) cause.coverImage = coverImage;
  if (goalAmount !== undefined) cause.goalAmount = goalAmount;
  if (active !== undefined) cause.active = !!active;
  if (featured !== undefined) {
    if (featured) await Cause.updateMany({ featured: true, _id: { $ne: cause._id } }, { featured: false });
    cause.featured = !!featured;
  }

  await cause.save();

  await logActivity({
    actor: { id: req.user.id, role: 'Admin', name: req.user.name, action: 'cause.updated', targetType: 'Cause', targetId: cause._id },
    message: `Updated donation cause "${cause.title}".`,
  });

  res.json(cause);
});

/** DELETE /api/causes/:id — admin only. */
const deleteCause = asyncHandler(async (req, res) => {
  const cause = await Cause.findById(req.params.id);
  if (!cause) return res.status(404).json({ error: 'Cause not found.' });
  await cause.deleteOne();

  await logActivity({
    actor: { id: req.user.id, role: 'Admin', name: req.user.name, action: 'cause.deleted', targetType: 'Cause', targetId: req.params.id },
    message: `Deleted donation cause "${cause.title}".`,
  });

  res.json({ message: 'Cause deleted.' });
});

module.exports = { listActive, getFeatured, getOne, listAll, createCause, updateCause, deleteCause };
