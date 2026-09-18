/**
 * Lazy Directus REST client. Mirrors the Razorpay helper pattern: if
 * DIRECTUS_URL / DIRECTUS_TOKEN aren't configured (local dev), getDirectus()
 * returns null so callers can respond with a clear, honest 503 instead of
 * crashing — the admin panel is fully usable without Directus, it just can't
 * browse collections until the credentials are set.
 *
 * Directus exposes an instant REST/GraphQL API over its connected database.
 * We authenticate with a static user token ("DIRECTUS_TOKEN") sent as a
 * Bearer header — the standard server-to-server pattern from
 * https://docs.directus.io/reference/authentication/#access-tokens
 *
 * Only Node 18+ native fetch is used (no SDK dependency needed).
 */

const DEFAULT_TIMEOUT_MS = 8000;

function getDirectus() {
  const url = process.env.DIRECTUS_URL;
  const token = process.env.DIRECTUS_TOKEN;
  if (!url || !token) return null;
  return {
    url: url.replace(/\/+$/, ''), // tolerate trailing slash in the env value
    token,
  };
}

/** True when both env vars are present — used by controllers for the 503 body. */
function isDirectusConfigured() {
  return Boolean(getDirectus());
}

/**
 * Calls the Directus REST API and resolves with the parsed JSON body.
 * Rejects with a descriptive Error (Directus relays its own `errors[0].message`
 * shape) so the central error handler surfaces something useful.
 *
 * path — e.g. '/collections' or '/items/posts' (appended to DIRECTUS_URL)
 * query — object of allowed query params (must be pre-sanitized by the caller;
 *         mongoSanitize strips `$`-prefixed keys, so no raw filter objects here)
 */
async function directusFetch(path, { query } = {}) {
  const cfg = getDirectus();
  if (!cfg) {
    const err = new Error('Directus is not configured.');
    err.status = 503;
    throw err;
  }

  const qs = query && Object.keys(query).length
    ? '?' + new URLSearchParams(query).toString()
    : '';
  const url = `${cfg.url}${path}${qs}`;

  let res;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    const e = new Error(`Could not reach the Directus server (${err.message}).`);
    e.status = 502;
    throw e;
  }

  let body = null;
  try { body = await res.json(); } catch (e) { /* empty or non-JSON body */ }

  if (!res.ok) {
    const detail = body?.errors?.[0]?.message;
    const e = new Error(
      `Directus responded ${res.status} for ${path}${detail ? `: ${detail}` : ''}`
    );
    e.status = res.status === 401 || res.status === 403 ? 502 : res.status;
    throw e;
  }
  return body;
}

module.exports = { getDirectus, isDirectusConfigured, directusFetch };
