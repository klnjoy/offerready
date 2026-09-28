/**
 * api/lib/supabaseAuth.js — server-side Supabase auth verification (Phase 2).
 * ---------------------------------------------------------------------------
 * Verifies the caller's Supabase access token (JWT) on the backend and returns
 * the authenticated user, or null. This is the IDENTITY foundation the premium
 * content API (Phase 3) builds on — it does NOT check entitlements here.
 *
 * SECURITY (spec §15/§28/§34):
 *   - Verification is done SERVER-SIDE by asking Supabase Auth to resolve the
 *     token (GET {SUPABASE_URL}/auth/v1/user with the Bearer token + anon key).
 *     A forged/expired token yields null — we never trust client claims.
 *   - Requires SUPABASE_URL + SUPABASE_ANON_KEY as server env vars. The
 *     service-role key is NOT needed for identity and must stay out of this path.
 *   - Fails CLOSED: any error, missing config, or non-200 => null (no user),
 *     so callers deny access rather than guess.
 *
 * No external dependencies (uses global fetch, available on the Vercel Node
 * runtime). Cache is intentionally omitted for correctness; add a short-lived
 * cache later if needed.
 */

'use strict';

const AUTH_TIMEOUT_MS = 8000;

/** Extract a Bearer token from the Authorization header. */
function bearerToken(req) {
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1] : null;
}

/**
 * Resolve the authenticated user for this request, or null.
 * @returns {Promise<{id:string, email:string|null, raw:object}|null>}
 */
async function getUser(req) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const token = bearerToken(req);
  // Fail closed on any missing prerequisite.
  if (!url || !anon || !token) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  try {
    const resp = await fetch(url.replace(/\/+$/, '') + '/auth/v1/user', {
      method: 'GET',
      signal: controller.signal,
      headers: {
        apikey: anon,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!resp.ok) return null; // 401/403 for bad/expired token
    const u = await resp.json();
    if (!u || !u.id) return null;
    return { id: u.id, email: u.email || null, raw: u };
  } catch (_err) {
    // Network error / abort / bad JSON — deny.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Convenience guard for handlers: resolves the user or sends 401 and returns
 * null. Usage:
 *   const user = await requireUser(req, res, sendJson);
 *   if (!user) return;   // 401 already sent
 */
async function requireUser(req, res, send) {
  const user = await getUser(req);
  if (!user) {
    send(res, 401, { error: 'Authentication required.' });
    return null;
  }
  return user;
}

module.exports = { getUser, requireUser, bearerToken };
