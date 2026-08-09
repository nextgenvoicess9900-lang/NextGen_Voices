# Publishing NEXTGEN to GitHub (and putting it online)

This repo has two independent parts that get pushed to GitHub together but
**deployed separately**:

```
nextgen/
├── frontend/
│   └── index.html      ← the entire website (single file)
└── backend/
    └── ...              ← Node/Express + MongoDB API
```

The frontend is one static HTML file that talks to the backend over HTTP.
They don't have to live on the same host — in fact the simplest free setup
puts them on two different services (see Step 3).

---

## Step 1 — Create the GitHub repository

1. Go to [github.com/new](https://github.com/new), name it (e.g. `nextgen`),
   leave it **empty** (no README/license — you already have files), click
   **Create repository**.
2. On your computer, in the folder containing `frontend/` and `backend/`:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

If `git` asks for credentials and you have 2FA enabled, use a
[Personal Access Token](https://github.com/settings/tokens) as the password,
not your GitHub password.

**Before you push:** confirm `backend/.gitignore` is actually being respected
— run `git status` and make sure `node_modules/`, `.env`, and any files
inside `uploads/` (other than `.gitkeep`) are **not** listed as new files.
If they are, you forgot to add `.gitignore` before your first `git add .`.

---

## Step 2 — Set up the database (MongoDB Atlas, free tier)

1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/cloud/atlas).
2. **Database Access** → add a database user (username + password).
3. **Network Access** → add IP address `0.0.0.0/0` (allow from anywhere) —
   simplest for getting started; tighten this later if you want.
4. **Connect** → "Connect your application" → copy the connection string.
   It looks like:
   `mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/nextgen?retryWrites=true&w=majority`
5. Save this — it's your `MONGO_URI`.

---

## Step 3 — Deploy the backend (Render, free tier)

1. Go to [render.com](https://render.com) → sign in with GitHub.
2. **New +** → **Web Service** → pick your repo.
3. Configure:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. **Environment** tab → add every variable from `backend/.env.example`:

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `PORT` | `10000` (Render sets this automatically — you can leave your own `PORT` var unset and Render will still work, since `server.js` reads `process.env.PORT`) |
   | `MONGO_URI` | the Atlas connection string from Step 2 |
   | `CLIENT_ORIGIN` | the URL your frontend will be served from (fill this in *after* Step 4, then redeploy) |
   | `JWT_SECRET` | run `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` locally and paste the output |
   | `COOKIE_SECRET` | a different random value, same command |
   | `CSRF_SECRET` | a third different random value, same command |
   | `SEED_ADMIN_USER_ID` | pick an admin login ID |
   | `SEED_ADMIN_PASSWORD` | pick a strong password (you'll change/remove this after seeding) |
   | `UPLOAD_DIR` | `uploads` |
   | `MAX_UPLOAD_MB` | `8` |

   Leave `SMTP_*` and `RAZORPAY_*` blank for now — the app degrades
   gracefully (emails log instead of sending, donations return a clear
   "not configured" error) rather than crashing.

5. Click **Create Web Service**. Render will build and deploy — this takes
   a few minutes. Once live, you'll get a URL like
   `https://nextgen-backend-xxxx.onrender.com`.

6. **Seed the admin account** — Render's dashboard has a **Shell** tab for
   your service once it's deployed. Open it and run:
   ```bash
   npm run seed:admin
   ```
   This creates the one Admin account from `SEED_ADMIN_USER_ID` /
   `SEED_ADMIN_PASSWORD`. Do this once, then consider removing
   `SEED_ADMIN_PASSWORD` from the environment variables afterward.

**Important limitation to know about:** Render's free tier has an
**ephemeral filesystem** — anything saved to `backend/uploads/` (workshop
banners, certificates, resources, profile photos) is **deleted every time
the service restarts or redeploys**. This is fine for testing, but before
real users rely on uploaded files, switch file storage to something
persistent (e.g. Cloudflare R2, AWS S3, or a Render persistent disk on a
paid plan). This isn't a small caveat — it will look like "my uploads keep
disappearing" and it's this, not a bug in the code.

---

## Step 4 — Deploy the frontend (GitHub Pages, free)

Since `frontend/index.html` is a single static file, GitHub Pages is the
simplest host — no build step, no separate account needed.

1. **First, point the frontend at your live backend.** Open
   `frontend/index.html`, find this line near the top of the `<script>`
   section (search for `NEXTGEN_API_BASE`):
   ```js
   window.NEXTGEN_API_BASE = window.NEXTGEN_API_BASE || 'http://localhost:5000/api';
   ```
   Change `http://localhost:5000/api` to your Render URL + `/api`, e.g.:
   ```js
   window.NEXTGEN_API_BASE = window.NEXTGEN_API_BASE || 'https://nextgen-backend-xxxx.onrender.com/api';
   ```
   Commit and push this change.

2. On GitHub, go to your repo → **Settings** → **Pages**.
3. **Source:** Deploy from a branch. **Branch:** `main`, **Folder:** `/frontend`.
4. Save. GitHub gives you a URL like
   `https://<your-username>.github.io/<repo-name>/` within a minute or two.

5. **Go back to Render** and set `CLIENT_ORIGIN` (from Step 3) to this exact
   GitHub Pages URL, then redeploy the backend. This is required — the
   backend's CORS/cookie settings only accept requests from the origin you
   configure there, and login/session cookies won't work cross-origin
   otherwise.

---

## Step 5 — Verify it actually works

1. Open your GitHub Pages URL.
2. Try logging in as Admin with the credentials you seeded in Step 3.
3. Open your browser's DevTools → Network tab, refresh, and confirm
   requests are going to your Render URL and coming back with `200`, not
   CORS errors or `401`s. If you see CORS errors, double check
   `CLIENT_ORIGIN` on Render matches your GitHub Pages URL **exactly**
   (including `https://`, no trailing slash mismatch).

---

## Alternative: one host for both (Render only)

If you'd rather not use two services, you can have Express serve the
frontend file directly instead of using GitHub Pages. Add this near the
bottom of `backend/server.js`, before `app.listen(...)`:

```js
const path = require('path');
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});
```

Then set `window.NEXTGEN_API_BASE` in `index.html` to `/api` (relative,
no domain) instead of a full URL, since frontend and backend now share one
origin. This simplifies CORS entirely (`CLIENT_ORIGIN` can equal your one
Render URL) at the cost of losing GitHub Pages' free static hosting.

---

## What's *not* handled by this guide

Consistent with how the whole app was built — no fabricated claims:

- **Email and SMS** won't actually send until you fill in real `SMTP_*`
  credentials (Step 3) — until then the backend logs what it *would* have
  sent instead of erroring.
- **Payments** (Donation Center) won't process until you add real
  `RAZORPAY_*` keys.
- **File uploads are not durable** on Render's free tier — see the warning
  in Step 3.
- **Custom domain** — both GitHub Pages and Render support one for free;
  their own docs cover the DNS steps, not repeated here since it depends
  on your domain registrar.
