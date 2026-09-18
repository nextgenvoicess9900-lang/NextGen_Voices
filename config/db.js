const mongoose = require('mongoose');

/**
 * True when a MongoDB URI is present in the environment. Used by server.js
 * to degrade gracefully in preview/dev environments: without a database the
 * website still boots and serves, and API endpoints answer with a clear 503
 * instead of hanging on buffered mongoose queries.
 */
function isDbConfigured() {
  return Boolean(process.env.MONGO_URI);
}

/**
 * Normalizes a user-supplied MONGO_URI. The most common Atlas paste mistake
 * is keeping the ":27017" port on an "mongodb+srv://" URI — SRV URIs resolve
 * their port from DNS records, so the driver hard-rejects any that carry one
 * ("mongodb+srv URI cannot have port number"). We can fix that automatically
 * instead of leaving the app dead until someone edits the key again.
 */
function normalizeUri(uri) {
  let out = uri.trim();
  if (out.startsWith('mongodb+srv://')) {
    const schemeEnd = 'mongodb+srv://'.length;
    const authEnd = out.indexOf('@', schemeEnd);
    const hostStart = authEnd === -1 ? schemeEnd : authEnd + 1;
    const rest = out.slice(hostStart);
    const slashIdx = rest.indexOf('/');
    const hostPart = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
    const afterHost = slashIdx === -1 ? '' : rest.slice(slashIdx);
    const colonIdx = hostPart.indexOf(':');
    if (colonIdx !== -1) {
      out = out.slice(0, hostStart) + hostPart.slice(0, colonIdx) + afterHost;
      console.warn('[db] Removed an invalid ":port" from the mongodb+srv URI (SRV URIs resolve ports via DNS).');
    }
  }
  return out;
}

/**
 * True when mongoose has an open, usable connection — evaluated per request,
 * so endpoints recover automatically once the DB connects, without a restart.
 */
function isDbReady() {
  return mongoose.connection.readyState === 1;
}

/**
 * A concise, honest reason for the current un-ready state, for 503 responses
 * and logs. Returns null when the database is connected and usable.
 */
function dbStatus() {
  if (!process.env.MONGO_URI) {
    return 'Database not configured. Set MONGO_URI to enable the API.';
  }
  switch (mongoose.connection.readyState) {
    case 0:
      return 'Database is disconnected.';
    case 2:
      return 'Database is still connecting — try again in a moment.';
    case 3:
      return 'Database connection is disconnecting — try again in a moment.';
    default:
      return null;
  }
}

/**
 * Connects to MongoDB using the URI supplied in the environment.
 *
 * A missing MONGO_URI is a soft condition (preview/dev) — boot continues so
 * the website is served and API routes answer 503. A configured URI that
 * fails is logged loudly but also does not kill the process: the app keeps
 * serving, reports its true status per request, and the connection retries
 * in the background so it recovers on its own (e.g. after Atlas network
 * access is opened) without anyone restarting the server.
 */
async function connectDB({ retry = true } = {}) {
  if (!isDbConfigured()) {
    console.warn(
      '[db] MONGO_URI is not set — booting without a database. ' +
      'The website is served, but API endpoints return 503 until MongoDB is configured.'
    );
    return null;
  }

  mongoose.set('strictQuery', true);

  const uri = normalizeUri(process.env.MONGO_URI);

  // Attach connection log listeners exactly once — connectDB() re-runs on
  // every background retry, and re-attaching here would stack duplicate
  // listeners and multiply every log line.
  if (!mongoose.connection.listenerCount('connected')) {
    mongoose.connection.on('connected', () => {
      console.log(`[db] MongoDB connected: ${mongoose.connection.host}`);
    });
    mongoose.connection.on('error', (err) => {
      console.error('[db] MongoDB connection error:', err.message);
    });
    mongoose.connection.on('disconnected', () => {
      console.warn('[db] MongoDB disconnected.');
    });
  }

  try {
    const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    return conn;
  } catch (err) {
    console.error('[db] MongoDB connection failed:', err.message);
    // The two most common URI mistakes, named plainly so they're fixable
    // without guesswork:
    if (/querySrv|ENOTFOUND/i.test(err.message)) {
      console.error(
        '[db] The hostname in MONGO_URI could not be resolved. An Atlas URI must ' +
        'include the cluster host: mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/<dbname> — ' +
        'copy it again via Atlas → Database → Connect → Drivers.'
      );
    } else if (/authentication failed|bad auth/i.test(err.message)) {
      console.error('[db] The username/password in MONGO_URI was rejected — recheck the database user credentials.');
    }
    if (!retry) return null;
    // The driver does not retry a failed *initial* connection on its own, so
    // we do: the server keeps serving the site and retrying in the background
    // (e.g. until Atlas network access is opened), no restart needed.
    console.error('[db] Retrying in 30s — data endpoints answer 503 until the connection succeeds.');
    const t = setTimeout(() => connectDB({ retry: true }), 30_000);
    if (typeof t.unref === 'function') t.unref();
    return null;
  }
}

module.exports = { connectDB, isDbConfigured, isDbReady, dbStatus, normalizeUri };
