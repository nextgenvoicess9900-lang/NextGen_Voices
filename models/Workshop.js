const mongoose = require('mongoose');

const CATEGORIES = [
  'Artificial Intelligence', 'Cybersecurity', 'Data Science', 'Cloud Computing',
  'Web Development', 'Robotics', 'Research Methodology', 'Career Skills', 'Other',
];
const DIFFICULTY_LEVELS = ['beginner', 'intermediate', 'advanced'];
const WORKSHOP_TYPES = ['online', 'offline', 'hybrid'];
const VISIBILITY = ['public', 'private', 'inviteOnly'];
const APPROVAL_MODES = ['automatic', 'manual'];

/**
 * Workshop statuses, in their natural lifecycle order (Chapter 1's
 * lifecycle diagram). `status` is set by Admin actions (draft/published/
 * cancelled/archived) or derived automatically from schedule + registration
 * dates (registrationOpen/registrationClosed/upcoming/startsSoon/live/
 * completed) by the scheduler — see utils/workshopStatus.js (Phase 3+).
 */
const STATUSES = [
  'draft', 'published', 'registrationOpen', 'registrationClosed',
  'upcoming', 'startsSoon', 'live', 'completed', 'archived', 'cancelled',
];

const speakerSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    designation: { type: String, trim: true },
    organization: { type: String, trim: true },
    bio: { type: String, trim: true, maxlength: 800 },
    photo: { type: String, trim: true },
  },
  { _id: false }
);

const meetingSchema = new mongoose.Schema(
  {
    platform: { type: String, enum: ['google-meet', 'zoom', 'ms-teams', 'custom'], default: 'google-meet' },
    link: { type: String, trim: true },
    meetingId: { type: String, trim: true },
    password: { type: String, trim: true },
    hostName: { type: String, trim: true },
    hostEmail: { type: String, trim: true },
    instructions: { type: String, trim: true, maxlength: 1000 },
    waitingRoomEnabled: { type: Boolean, default: false },
    allowLateEntry: { type: Boolean, default: true },
  },
  { _id: false }
);

const registrationSettingsSchema = new mongoose.Schema(
  {
    opensAt: { type: Date },
    closesAt: { type: Date },
    maxParticipants: { type: Number, default: 100 },
    waitingListEnabled: { type: Boolean, default: true },
    maxWaitingListSize: { type: Number, default: 50 },
    approvalMode: { type: String, enum: APPROVAL_MODES, default: 'automatic' },
    collectFields: { type: [String], default: ['institution', 'phone', 'country'] },
    customQuestions: [{ label: { type: String, trim: true }, required: { type: Boolean, default: false } }],
    cancellationAllowed: { type: Boolean, default: true },
    cancellationDeadline: { type: Date },
    enableConfirmationEmail: { type: Boolean, default: true },
    enableConfirmationSms: { type: Boolean, default: false },
    enableWebsiteNotification: { type: Boolean, default: true },
    enablePopupNotification: { type: Boolean, default: true },
    enableCalendarInvite: { type: Boolean, default: false },
  },
  { _id: false }
);

const workshopSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    subtitle: { type: String, trim: true, maxlength: 200 },
    description: { type: String, trim: true }, // sanitized rich text, see controller
    category: { type: String, enum: CATEGORIES, default: 'Other' },
    tags: [{ type: String, trim: true }],

    bannerImage: { type: String, trim: true, default: '' },
    thumbnailImage: { type: String, trim: true, default: '' },

    speaker: speakerSchema,

    language: { type: String, trim: true, default: 'English' },
    difficulty: { type: String, enum: DIFFICULTY_LEVELS, default: 'beginner' },
    durationMinutes: { type: Number, default: 60 },
    type: { type: String, enum: WORKSHOP_TYPES, default: 'online' },

    learningOutcomes: [{ type: String, trim: true }],
    agenda: [{ time: { type: String, trim: true }, item: { type: String, trim: true } }],
    prerequisites: [{ type: String, trim: true }],
    skillsCovered: [{ type: String, trim: true }],

    certificateAvailable: { type: Boolean, default: true },
    visibility: { type: String, enum: VISIBILITY, default: 'public' },
    status: { type: String, enum: STATUSES, default: 'draft' },

    schedule: {
      date: { type: Date },
      startTime: { type: String, trim: true }, // "HH:mm", paired with `date`+`timezone` for display
      endTime: { type: String, trim: true },
      timezone: { type: String, trim: true, default: 'Asia/Kolkata' },
    },
    meeting: meetingSchema,
    volunteerReportingTime: { type: String, trim: true },

    registration: { type: registrationSettingsSchema, default: () => ({}) },

    // Populated once reminder scheduling ships (Phase 3+). Kept on the
    // schema now so the wizard's Step 6 has somewhere real to write to.
    reminderSchedule: [{
      trigger: { type: String, trim: true }, // e.g. '24h-before', 'workshop-live'
      channels: { type: [String], default: [] }, // 'website' | 'popup' | 'email' | 'sms'
      enabled: { type: Boolean, default: true },
    }],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    publishedAt: { type: Date },
    archivedAt: { type: Date },
    // When set (status stays 'draft' until then), the scheduler flips this
    // to 'published' automatically — same cron job that already handles
    // scheduled Announcements, see utils/scheduler.js.
    scheduledPublishAt: { type: Date },
  },
  { timestamps: true }
);

workshopSchema.index({ status: 1, 'schedule.date': 1 });
workshopSchema.index({ title: 'text', tags: 'text' });

module.exports = mongoose.model('Workshop', workshopSchema);
module.exports.CATEGORIES = CATEGORIES;
module.exports.DIFFICULTY_LEVELS = DIFFICULTY_LEVELS;
module.exports.WORKSHOP_TYPES = WORKSHOP_TYPES;
module.exports.STATUSES = STATUSES;
