/**
 * GET /api/premium/scenarios/:slug  (Vercel serverless function)
 * ---------------------------------------------------------------------------
 * Returns the FULL scenario tree (protected `content`) ONLY when the caller is
 * authenticated AND holds the required entitlement (spec §20). This is the
 * single authorization gate for premium content.
 *
 * Access matrix (spec §28/§29):
 *   anonymous            -> 401 (no token)
 *   authenticated, no entitlement -> 403 (upgrade required) + teaser
 *   authenticated, entitled       -> 200 + full scenario
 *   any backend/entitlement failure -> deny (fail closed, §34)
 *
 * NEVER trusts a client "isPro" flag. Identity comes from a verified Supabase
 * JWT; entitlement is read server-side with the service-role key.
 */

'use strict';

const { setCors, send } = require('../../_lib/http');
const { getUser } = require('../../_lib/supabaseAuth');
const { getPremiumContent, hasEntitlement } = require('../../_lib/entitlements');

module.exports = async function handler(req, res) {
  setCors(res, req.headers && req.headers.origin);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { send(res, 405, { error: 'Method not allowed.' }); return; }

  // slug from the dynamic route (fallback to query for safety).
  const slug = (req.query && (req.query.slug || req.query['[slug]']))
    || (req.url || '').split('/').pop().split('?')[0];
  if (!slug) { send(res, 400, { error: 'Missing scenario slug.' }); return; }

  // 1) Identity — must be a valid Supabase token.
  const user = await getUser(req);
  if (!user) { send(res, 401, { error: 'Sign in to open this scenario.' }); return; }

  // 2) Load the content (published only). 404 if it doesn't exist.
  const row = await getPremiumContent(slug);
  if (!row) { send(res, 404, { error: 'Scenario not found.' }); return; }

  // 3) Authorization — must hold the required entitlement (fail closed).
  const ok = await hasEntitlement(user.id, row.required_entitlement);
  if (!ok) {
    // Return only the teaser + an upgrade signal — never the protected body.
    send(res, 403, {
      error: 'This scenario is part of OfferReady Pro.',
      upgrade: true,
      required_entitlement: row.required_entitlement,
      title: row.title,
      teaser: row.teaser || null,
    });
    return;
  }

  // 4) Authorized — return the full scenario tree.
  send(res, 200, {
    ok: true,
    scenario: {
      slug: row.slug,
      title: row.title,
      category: row.category,
      teaser: row.teaser || null,
      content: row.content || {},   // the protected node tree
    },
  });
};
