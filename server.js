require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const path = require('path');

const connectDB = require('./config/db');
const { apiLimiter } = require('./middleware/rateLimiters');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const startScheduler = require('./utils/scheduler');

const authRoutes = require('./routes/authRoutes');
const csrfRoutes = require('./routes/csrfRoutes');
const editorRoutes = require('./routes/editorRoutes');
const postRoutes = require('./routes/postRoutes');
const questionRoutes = require('./routes/questionRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const announcementRoutes = require('./routes/announcementRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const activityRoutes = require('./routes/activityRoutes');
const searchRoutes = require('./routes/searchRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const viewerRoutes = require('./routes/viewerRoutes');
const counselingRoutes = require('./routes/counselingRoutes');
const causeRoutes = require('./routes/causeRoutes');
const donationRoutes = require('./routes/donationRoutes');
const impactStatRoutes = require('./routes/impactStatRoutes');
const workshopRoutes = require('./routes/workshopRoutes');

const app = express();

// ---- Core hardening ----
app.set('trust proxy', 1); // needed for correct req.ip behind a load balancer / reverse proxy
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN, // exact origin only — never '*' when credentials are used
    credentials: true,
  })
);
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(mongoSanitize()); // strips any key starting with `$` or containing `.` from req.body/query/params

// Baseline rate limit on the whole API; stricter limiters are layered on
// top for auth and the public question box (see their route files).
app.use('/api', apiLimiter);

// Static file serving for uploaded media.
app.use('/uploads', express.static(path.join(__dirname, process.env.UPLOAD_DIR || 'uploads')));

// ---- Routes ----
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.use('/api/csrf-token', csrfRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/editors', editorRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/viewers', viewerRoutes);
app.use('/api/counseling', counselingRoutes);
app.use('/api/causes', causeRoutes);
app.use('/api/donations', donationRoutes);
app.use('/api/impact-stats', impactStatRoutes);
app.use('/api/workshops', workshopRoutes);
app.use('/api/registrations', require('./routes/registrationRoutes'));
app.use('/api/my-notifications', require('./routes/myNotificationRoutes'));
app.use('/api/assignments', require('./routes/assignmentRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/assessments', require('./routes/assessmentRoutes'));
app.use('/api/assessment-questions', require('./routes/assessmentQuestionRoutes'));
app.use('/api/attempts', require('./routes/attemptRoutes'));
app.use('/api/resources', require('./routes/resourceRoutes'));
app.use('/api/certificates', require('./routes/certificateRoutes'));

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  startScheduler();
  app.listen(PORT, () => console.log(`[server] NEXTGEN API listening on port ${PORT}`));
});

module.exports = app;
