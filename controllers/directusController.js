const asyncHandler = require('../utils/asyncHandler');
const { isDirectusConfigured, directusFetch } = require('../utils/directus');

/**
 * Directus — an open-source data platform that wraps any SQL database with an
 * instant REST/GraphQL API and an admin app. These endpoints let the NEXTGEN
 * admin browse the collections of a configured Directus instance straight from
 * the Integrations card (collections → items), without exposing the
 * DIRECTUS_TOKEN to the browser: every call is proxied through this backend.
 */

/**
 * GET /api/directus/status
 * Tells the admin UI whether Directus is configured (env vars present) so the
 * card can render a setup notice instead of a spinning error. Deliberately
 * reveals only the URL host — never the token.
 */
const getStatus = asyncHandler(async (req, res) => {
  const configured = isDirectusConfigured();
  let host = null;
  if (configured) {
    try {
      host = new URL(process.env.DIRECTUS_URL).host;
    } catch (e) {
      host = null; // unparseable URL — treat as misconfigured
    }
  }
  res.json({ configured, host });
});

/**
 * GET /api/directus/collections
 * Proxies Directus's `GET /collections` endpoint (lists every collection the
 * token can see, with schema metadata like field counts). Read-only proxy of
 * a trusted admin-side API; path segments and query params are strictly
 * allow-listed — no arbitrary path or filter pass-through.
 */
const listCollections = asyncHandler(async (req, res) => {
  const data = await directusFetch('/collections', {
    query: { limit: -1 },
  });
  res.json(data.data || []);
});

/**
 * GET /api/directus/collections/:collection/items?limit=&page=
 * Proxies Directus's `GET /items/{collection}` endpoint so the admin can
 * preview rows of any collection. `:collection` is validated against a safe
 * identifier pattern, so this cannot be abused as an open proxy.
 */
const listItems = asyncHandler(async (req, res) => {
  const collection = req.params.collection;
  // Safe identifier check: letters/digits/underscore/hyphen only (Directus
  // collection names are restricted to this set). Prevents path traversal
  // or passing through unexpected path segments.
  if (!/^[A-Za-z0-9_-]+$/.test(collection)) {
    return res.status(422).json({ error: 'Invalid collection name.' });
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const data = await directusFetch(`/items/${collection}`, {
    query: { limit: String(limit), page: String(page), meta: 'filter_count' },
  });
  res.json({ data: data.data || [], filterCount: data.meta?.filter_count ?? null });
});

module.exports = { getStatus, listCollections, listItems };
