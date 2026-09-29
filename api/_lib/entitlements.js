/**
 * api/lib/entitlements.js — server-side entitlement checks (Phase 3).
 * ---------------------------------------------------------------------------
 * Given a verified user id, ask Supabase (with the SERVICE-ROLE key) whether
 * they hold an active entitlement for a feature. This is the authorization
 * layer for premium content (spec §13/§20).
 *
 * SECURITY / FAIL-CLOSED (spec §34):
 *   - Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server-only). The
 *     service-role key bypasses RLS so the backend can read entitlements; it
 *     must NEVER be shipped to the browser.
 *   - Any error, missing config, non-200, or unreadable body => returns FALSE
 *     (no access). We never grant on uncertainty.
 *   - Entitlement is "active" only if status='active' AND (expires_at is null
 *     OR expires_at > now). The subscription-state → entitlement mapping is
 *     owned by the Stripe webhook handler (Phase 4); this module only reads.
 *
 * No external deps (global fetch on the Vercel Node runtime).
 */

'use strict';

const TIMEOUT_MS = 8000;

function serviceHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Does `userId` hold an active entitlement for `feature`?
 * @returns {Promise<boolean>} false on any error (fail closed).
 */
async function hasEntitlement(userId, feature) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !userId || !feature) return false;

  const nowIso = new Date().toISOString();
  // PostgREST filter: own row, this feature, active, not expired.
  // expires_at is null OR in the future -> use an `or` filter.
  const qs =
    `user_id=eq.${encodeURIComponent(userId)}` +
    `&feature=eq.${encodeURIComponent(feature)}` +
    `&status=eq.active` +
    `&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(nowIso)})` +
    `&select=feature&limit=1`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(
      url.replace(/\/+$/, '') + '/rest/v1/entitlements?' + qs,
      { method: 'GET', headers: serviceHeaders(), signal: controller.signal }
    );
    if (!resp.ok) return false;
    const rows = await resp.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch (_err) {
    return false; // fail closed
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch a published premium_content row by slug via service-role, or null. */
async function getPremiumContent(slug) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !slug) return null;

  const qs =
    `slug=eq.${encodeURIComponent(slug)}` +
    `&published=eq.true` +
    `&select=slug,title,category,required_entitlement,teaser,content&limit=1`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(
      url.replace(/\/+$/, '') + '/rest/v1/premium_content?' + qs,
      { method: 'GET', headers: serviceHeaders(), signal: controller.signal }
    );
    if (!resp.ok) return null;
    const rows = await resp.json();
    return (Array.isArray(rows) && rows[0]) || null;
  } catch (_err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** List published premium content (teasers only — safe fields). */
async function listPremiumTeasers() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  const qs =
    `published=eq.true` +
    `&select=slug,title,category,required_entitlement,teaser` +
    `&order=category.asc`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(
      url.replace(/\/+$/, '') + '/rest/v1/premium_content?' + qs,
      { method: 'GET', headers: serviceHeaders(), signal: controller.signal }
    );
    if (!resp.ok) return [];
    const rows = await resp.json();
    return Array.isArray(rows) ? rows : [];
  } catch (_err) {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { hasEntitlement, getPremiumContent, listPremiumTeasers };
