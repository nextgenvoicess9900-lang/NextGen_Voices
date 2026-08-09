/**
 * One-time convenience script: `node utils/seedImpactStats.js`
 * Seeds the five default Impact Dashboard cards from the design spec so
 * the Donation Center isn't empty on a fresh install. Safe to re-run —
 * upserts by `key`, so it never creates duplicates. Admins can edit these
 * afterwards from Donation Center management in the dashboard.
 */
require('dotenv').config();
const connectDB = require('../config/db');
const ImpactStat = require('../models/ImpactStat');

const DEFAULTS = [
  { key: 'students_supported', label: 'Students Supported', icon: '🎓', value: 12483, monthlyIncrease: 240, order: 1 },
  { key: 'scholarships_funded', label: 'Scholarships Funded', icon: '💰', value: 186, monthlyIncrease: 6, order: 2 },
  { key: 'research_projects', label: 'Research Projects', icon: '🧪', value: 314, monthlyIncrease: 9, order: 3 },
  { key: 'competitions_sponsored', label: 'Competitions Sponsored', icon: '🏆', value: 54, monthlyIncrease: 2, order: 4 },
  { key: 'community_programs', label: 'Community Programs', icon: '🌍', value: 28, monthlyIncrease: 1, order: 5 },
];

(async () => {
  await connectDB();
  for (const stat of DEFAULTS) {
    await ImpactStat.findOneAndUpdate({ key: stat.key }, stat, { upsert: true, new: true });
    console.log(`Seeded stat: ${stat.label}`);
  }
  console.log('Done. Edit these anytime from the admin dashboard\'s Donation Center management view.');
  process.exit(0);
})();
