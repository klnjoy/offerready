/**
 * GET /api/premium/scenarios  (Vercel serverless function)
 * ---------------------------------------------------------------------------
 * Lists published premium scenarios as TEASERS ONLY (spec §21). This endpoint
 * is intentionally public — teasers are safe marketing surface. It never
 * returns the protected `content` (full node tree).
 *
 * If the caller is authenticated, we annotate each item with `entitled` so the
 * UI can show "Open" vs "Upgrade" — but access to the full body is still
 * enforced separately by [slug].js on fetch (never trust this flag).
 */

'use strict';

const { setCors, send } = require('../../_lib/http');
const { listPremiumTeasers, hasEntitlement } = require('../../_lib/entitlements');
const { getUser } = require('../../_lib/supabaseAuth');

module.exports = async function handler(req, res) {
  setCors(res, req.headers && req.headers.origin);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { send(res, 405, { error: 'Method not allowed.' }); return; }

  const rows = await listPremiumTeasers();

  // Optional: if a valid token is present, tell the UI which are unlocked.
  let user = null;
  try { user = await getUser(req); } catch (_) { user = null; }

  const items = [];
  for (const r of rows) {
    let entitled = false;
    if (user) {
      // Fail-closed check; annotation only, not authorization.
      entitled = await hasEntitlement(user.id, r.required_entitlement);
    }
    items.push({
      slug: r.slug,
      title: r.title,
      category: r.category,
      required_entitlement: r.required_entitlement,
      teaser: r.teaser || null,   // public-safe
      entitled,
    });
  }

  send(res, 200, { ok: true, signedIn: Boolean(user), scenarios: items });
};
