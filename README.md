# NEXTGEN Admin Dashboard — Backend

A production-oriented Node/Express + MongoDB API for the NEXTGEN Admin
Dashboard: two roles (Admin, Editor), editor self-registration with
Admin approval, posts, viewer questions, notifications, announcements,
analytics, and an audit log.

This is a **starting point**, not a black box — read `server.js` and the
`middleware/` folder before deploying; adjust the security defaults
(rate limits, cookie flags, CORS origin) to your actual hosting setup.

## 1. Install & configure

```bash
cd nextgen-backend
npm install
cp .env.example .env
```

Edit `.env`:
- Generate real random secrets for `JWT_SECRET`, `COOKIE_SECRET`, `CSRF_SECRET`
  (e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`).
- Point `MONGO_URI` at your MongoDB instance (Atlas or self-hosted).
- Set `CLIENT_ORIGIN` to the exact origin your frontend is served from.

## 2. Create the Admin account

There is no public admin-registration endpoint — the single Admin account
is created once, from environment variables, never hardcoded in client code:

```bash
npm run seed:admin
```

This reads `SEED_ADMIN_USER_ID` / `SEED_ADMIN_PASSWORD` from `.env`, hashes
the password with bcrypt (12 rounds), and stores only the hash. Remove or
rotate `SEED_ADMIN_PASSWORD` from `.env` afterwards if you share that file.

## 3. Run

```bash
npm run dev     # nodemon, local development
npm start       # production
```

The API listens on `PORT` (default `5000`) and exposes everything under `/api`.

## Roles

Three account types now exist:

- **Admin** — full control (unchanged from before).
- **Editor** — own posts + answering viewer questions (unchanged from before).
- **Viewer** — a student/visitor account, **passwordless**. There is no
  password field at all: logging in means requesting a 6-digit code emailed
  to the address on file and entering it within 10 minutes
  (`models/Viewer.js`, `utils/otp.js`). The account is created automatically
  on first request — no separate "register" step, no admin approval.
  Unlocks two things only: opting into notification emails, and booking
  one-on-one counseling slots. Viewers have **no** access to the admin
  dashboard — `authorize('viewer')` gates their routes the same way
  `authorize('admin')` / `authorize('editor')` gate the others.

**Nothing about public browsing changed.** Posts, notifications, and
announcements were public `GET` endpoints before Viewers existed and still
are — nobody needs an account to read them. Viewer accounts only add two
capabilities: email delivery of new notifications, and counseling bookings.

## Donation Center (Razorpay)

The Donation Center accepts real payments via [Razorpay](https://razorpay.com),
which is the standard gateway for accepting rupee (₹) payments. To enable it:

1. Create a Razorpay account and get your key pair from
   [dashboard.razorpay.com/app/keys](https://dashboard.razorpay.com/app/keys).
2. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `.env`.
3. `npm run seed:impact-stats` to populate the Live Impact Dashboard with
   the five default numbers from the design spec — edit them anytime from
   the admin dashboard's Donation Center management view.
4. Create at least one `Cause` (from the admin dashboard or via `POST
   /api/causes`) so there's something for donors to select and support.

**Without Razorpay keys configured**, `POST /api/donations/create-order`
returns a clear `503` error instead of a fake success — the entire
Donation Center UI (causes, impact dashboard, wall of gratitude, tree
counter) is still fully buildable and browsable, it just can't take a real
payment until you add your own merchant keys.

**Security note:** a payment is never marked `completed` — and a cause's
raised amount never increases — until `POST /api/donations/verify` checks
the payment's HMAC-SHA256 signature against your `RAZORPAY_KEY_SECRET`
server-side. The client-reported "payment succeeded" callback from
Razorpay's Checkout.js is never trusted on its own; this is the standard,
required integration pattern for Razorpay (or any gateway using signed
webhooks/callbacks).

## Counseling & email notifications

- Admin/Editor open bookable slots (`POST /api/counseling/slots`); Viewers
  browse them publicly-ish (`GET /api/counseling/slots`, open slots only,
  no viewer identity ever exposed) and book one (`POST .../book`, viewer
  session required). Booking is atomic — `findOneAndUpdate` on `status:
  'open'` — so two people can't win the same slot in a race.
- When an Admin publishes a `Notification`, every `Viewer` with
  `emailNotifications: true` gets an email (`utils/mailer.js`, via
  `nodemailer`). If `SMTP_HOST` isn't set in `.env`, sending is skipped and
  logged instead of failing — handy for local dev without a mail account.
- Booking a slot also sends the viewer a one-off confirmation email through
  the same mailer.

## Security model

| Concern | How it's handled |
|---|---|
| Passwords | Never stored in plaintext — bcrypt, 12 salt rounds (`bcryptjs`) |
| Sessions | JWT in an **httpOnly, sameSite=strict** cookie — inaccessible to JS, mitigates XSS token theft |
| CSRF | Double-submit cookie pattern (`csrf-csrf`) — frontend must send `x-csrf-token` header matching the readable cookie on every state-changing request. Fetch `GET /api/csrf-token` on app load. |
| Rate limiting | `express-rate-limit`: tight on `/auth/*` (login/register), moderate on the public question box, a general baseline on all of `/api` |
| Input validation | `express-validator` on every write endpoint (auth, posts, questions, notifications, announcements) |
| NoSQL injection | `express-mongo-sanitize` strips `$`/`.` operators from `body`/`query`/`params` globally |
| XSS / stored HTML | `sanitize-html` scrubs all rich-text fields (post content, announcement descriptions, question answers) down to an allow-list of tags/attributes before saving |
| Authorization | Two explicit roles only (`admin`, `editor`), enforced **server-side** in `middleware/authorize.js` — not just hidden in the UI. Editors can only edit/delete their own posts (`authorizeOwnerOrAdmin`) |
| Transport/headers | `helmet()` for standard security headers; `cors()` locked to a single configured origin with credentials |
| Editor approval | Strictly two actions on a pending request — **Accept** (promotes to `Editor`) or **Revoke** (permanent delete) — no toggles, no partial states, matching the product spec |
| Viewer OTP login | Code is never stored in plaintext (HMAC-SHA256 with a server pepper, `utils/otp.js`), expires in 10 minutes, invalidated after 5 wrong guesses, and a 45s resend cooldown per email prevents mail-bombing an inbox |

None of this replaces a security review before going live — in particular,
put the API behind HTTPS in production (`secure` cookies require it),
consider a Web Application Firewall, and rotate secrets regularly.

## Project structure

```
nextgen-backend/
├── server.js              # app entry point, middleware wiring
├── config/db.js           # MongoDB connection
├── models/                # Mongoose schemas (Admin, Editor, PendingEditor,
│                           #   Post, Question, Notification, Announcement,
│                           #   ActivityLog, Media, Settings)
├── middleware/             # authenticate, authorize, csrf, rate limiters,
│                           #   validation, error handling
├── controllers/            # one file per resource, business logic only
├── routes/                 # one file per resource, wires middleware + validators
└── utils/                  # tokens, sanitizers, activity logging, cron scheduler, seed script
```

## API reference (summary)

All request/response bodies are JSON. Endpoints marked **auth** require the
session cookie; **admin** / **editor** further restrict by role.

### Auth
- `GET /api/csrf-token` — fetch CSRF token (call first)
- `POST /api/auth/admin/login` `{ userId, password }`
- `POST /api/auth/editor/register` `{ fullName, email, institution, phone, username, password, confirmPassword, profilePhoto }` → creates a **pending** request
- `POST /api/auth/editor/login` `{ username, password }` — fails with 403 while still pending
- `POST /api/auth/viewer/request-otp` `{ email, fullName?, institution? }` → creates the account on first request (no admin approval, no password); emails a 6-digit code. `fullName`/`institution` are only used if the account doesn't exist yet.
- `POST /api/auth/viewer/verify-otp` `{ email, code }` → verifies the code and signs the viewer in
- `GET /api/auth/me` — auth
- `POST /api/auth/logout` — auth

### Viewers (viewer only)
- `GET /api/viewers/me`
- `PUT /api/viewers/me` `{ fullName?, institution?, emailNotifications? }` — the notification opt-in/out toggle

### Counseling
- `GET /api/counseling/slots` — public, open + upcoming only
- `GET /api/counseling/slots/mine` — auth (admin/editor), their own hosted slots incl. who booked
- `POST /api/counseling/slots` — auth (admin/editor) `{ topic?, date, startTime, endTime, notes? }`
- `DELETE /api/counseling/slots/:id` — auth (admin/editor, must be the host or an admin)
- `POST /api/counseling/slots/:id/book` — auth (viewer) `{ viewerNote? }`
- `GET /api/counseling/bookings/mine` — auth (viewer)
- `POST /api/counseling/slots/:id/cancel-booking` — auth (viewer, must be their own booking)

### Editors (admin only)
- `GET /api/editors/pending`
- `GET /api/editors`
- `POST /api/editors/:id/accept`
- `POST /api/editors/:id/revoke`
- `DELETE /api/editors/:id`
- `GET /api/editors/:id/analytics` — admin, or the editor viewing their own

### Posts
- `GET /api/posts` — public, published only
- `GET /api/posts/:id` — public if published; owner/admin if draft
- `GET /api/posts/mine/list` — auth (admin/editor)
- `GET /api/posts/admin/all` — admin
- `POST /api/posts` — auth (admin/editor)
- `PUT /api/posts/:id` — owner or admin
- `DELETE /api/posts/:id` — owner or admin

### Posts
- `GET /api/posts/explore?q=&category=&contentType=&sort=&page=&limit=` — public. The Explore feed: search (with light synonym expansion), category/type filters, sort (`newest`/`trending`/`mostViewed`/`mostLiked`/`featured`), pagination
- `GET /api/posts/explore/stats` — public. Live counts (+ "today" delta) per content bucket, for the Explore page's statistics strip
- `GET /api/posts/suggest?q=` — public, autocomplete (titles/categories/tags)
- `GET /api/posts` — public, published only
- `GET /api/posts/:id` — public if published; owner/admin if draft; identity optional (flags `likedByMe`/`bookmarkedByMe` if logged in)
- `GET /api/posts/mine/list` — auth (admin/editor)
- `GET /api/posts/admin/all` — admin
- `GET /api/posts/bookmarks/mine` — auth (admin/editor/viewer)
- `POST /api/posts` — auth (admin/editor) — now also accepts `contentType`, `media[]`, `opportunityMeta`, `researchMeta`, `featured`
- `PUT /api/posts/:id` — owner or admin
- `DELETE /api/posts/:id` — owner or admin
- `POST /api/posts/:id/like` / `POST /api/posts/:id/bookmark` — auth (admin/editor/viewer), toggles

### Questions
- `POST /api/questions` — public, anonymous, rate-limited
- `GET /api/questions` — auth (admin/editor)
- `POST /api/questions/:id/answer` — auth (admin/editor)
- `PUT /api/questions/:id/status` — auth (admin/editor)
- `DELETE /api/questions/:id` — admin

### Notifications
- `GET /api/notifications` — public (published, scheduled time has passed, unexpired; pinned/urgent sort first)
- `GET /api/notifications/all` — auth (admin/editor)
- `POST /api/notifications` — admin — `{ title, message, category, priority, link?, pinned?, urgent?, scheduledFor?, expiryDate? }`
- `PUT /api/notifications/:id` — admin, edit any field
- `DELETE /api/notifications/:id` — admin

### Announcements
- `GET /api/announcements` — public
- `GET /api/announcements/all` — admin
- `POST /api/announcements` — admin (auto-publishes, or schedules if `scheduleDate` is future)
- `DELETE /api/announcements/:id` — admin

### Analytics & activity (admin only)
- `GET /api/analytics/overview`
- `GET /api/activity`

### Search (admin/editor)
- `GET /api/search?q=...`

### Settings
- `GET /api/settings` — public
- `PUT /api/settings` — admin

### Uploads (admin/editor)
- `POST /api/uploads` — multipart `file` field, images/video only, size-limited

### Causes (Donation Center campaigns)
- `GET /api/causes` — public, active causes
- `GET /api/causes/featured` — public, the "Opportunity of the Day" cause
- `GET /api/causes/:id` — public
- `GET /api/causes/admin/all` — admin, includes inactive
- `POST /api/causes` — admin `{ title, description, category, coverImage, goalAmount, featured }`
- `PUT /api/causes/:id` — admin
- `DELETE /api/causes/:id` — admin

### Donations (Razorpay-backed)
- `POST /api/donations/create-order` — public `{ causeId, amount, donorName?, donorEmail?, anonymous?, message? }` → opens a Razorpay order; returns 503 with a clear message if `RAZORPAY_KEY_ID`/`SECRET` aren't configured
- `POST /api/donations/verify` — public `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` → verifies the HMAC-SHA256 signature server-side before marking the donation `completed` and incrementing the cause's `raisedAmount`
- `GET /api/donations/impact` — public, curated Impact Dashboard stats + real totals
- `GET /api/donations/wall` — public, Wall of Gratitude (messages left with completed donations)
- `GET /api/donations/tree` — public, total completed-donation count ("Tree of Contributors")
- `GET /api/donations/admin/all` — admin, full donation ledger

### Impact Stats (admin-curated dashboard numbers)
- `GET /api/impact-stats/admin/all` — admin
- `POST /api/impact-stats` — admin, upsert by `key` `{ key, label, icon, value, monthlyIncrease, order }`
- `DELETE /api/impact-stats/:id` — admin

## Wiring up the existing frontend

The current NEXTGEN site (`nextgen-enhanced.html`) manages its admin panel
purely with `localStorage`. To connect it to this API:
1. On app load, `fetch('/api/csrf-token')` and store the token in memory.
2. Replace the `localStorage` reads/writes in the admin dashboard's JS with
   `fetch()` calls to the endpoints above, sending `credentials: 'include'`
   and the `x-csrf-token` header on writes.
3. Add an Editor Registration view and a Pending Approvals view (Accept /
   Revoke buttons only) to the admin route — happy to build that frontend
   pass next if useful.
