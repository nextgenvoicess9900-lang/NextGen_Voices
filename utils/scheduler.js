const cron = require('node-cron');
const Announcement = require('../models/Announcement');
const Workshop = require('../models/Workshop');

/**
 * Runs every minute and flips:
 *  - any announcement whose `scheduleDate` has passed from 'scheduled' to 'published'
 *  - any draft workshop whose `scheduledPublishAt` has passed to 'published'
 * (Workshop Wizard Step 7's "Schedule Publish" writes to that field —
 * this is the real mechanism behind it, not a UI-only promise.)
 * Started once from server.js.
 */
function startScheduler() {
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const due = await Announcement.find({ status: 'scheduled', scheduleDate: { $lte: now } });
      for (const a of due) {
        a.status = 'published';
        a.publishDate = a.publishDate || now;
        await a.save();
        console.log(`[scheduler] Auto-published announcement "${a.title}"`);
      }

      const dueWorkshops = await Workshop.find({ status: 'draft', scheduledPublishAt: { $lte: now } });
      for (const w of dueWorkshops) {
        w.status = 'published';
        w.publishedAt = now;
        await w.save();
        console.log(`[scheduler] Auto-published workshop "${w.title}"`);
      }
    } catch (err) {
      console.error('[scheduler] error:', err.message);
    }
  });
}

module.exports = startScheduler;
