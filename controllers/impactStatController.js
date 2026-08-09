const ImpactStat = require('../models/ImpactStat');
const asyncHandler = require('../utils/asyncHandler');
const logActivity = require('../utils/logActivity');
const { sanitizePlainText } = require('../utils/sanitizeContent');

/** GET /api/impact-stats/admin/all — admin only, for the management UI (public reads happen via donationController.impactStats). */
const listAll = asyncHandler(async (req, res) => {
  const stats = await ImpactStat.find().sort('order');
  res.json(stats);
});

/** POST /api/impact-stats — admin only. Creates or updates (by `key`) a curated dashboard stat — upsert keeps this idempotent for seeding. */
const upsertStat = asyncHandler(async (req, res) => {
  const { key, label, icon, value, monthlyIncrease, order } = req.body;
  const stat = await ImpactStat.findOneAndUpdate(
    { key: sanitizePlainText(key) },
    {
      key: sanitizePlainText(key),
      label: sanitizePlainText(label),
      icon: icon || '✨',
      value: Number(value) || 0,
      monthlyIncrease: Number(monthlyIncrease) || 0,
      order: Number(order) || 0,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await logActivity({
    actor: { id: req.user.id, role: 'Admin', name: req.user.name, action: 'impactstat.upserted', targetType: 'ImpactStat', targetId: stat._id },
    message: `Updated impact stat "${stat.label}".`,
  });

  res.json(stat);
});

/** DELETE /api/impact-stats/:id — admin only. */
const deleteStat = asyncHandler(async (req, res) => {
  const stat = await ImpactStat.findById(req.params.id);
  if (!stat) return res.status(404).json({ error: 'Stat not found.' });
  await stat.deleteOne();
  res.json({ message: 'Stat deleted.' });
});

module.exports = { listAll, upsertStat, deleteStat };
