const mongoose = require('mongoose');

/** Settings — singleton document (there is only ever one). */
const settingsSchema = new mongoose.Schema(
  {
    siteName: { type: String, default: 'NEXTGEN' },
    logoUrl: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    socialLinks: {
      instagram: { type: String, default: '' },
      linkedin: { type: String, default: '' },
      twitter: { type: String, default: '' },
      youtube: { type: String, default: '' },
    },
    footerText: { type: String, default: '' },
    autoBackup: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);
