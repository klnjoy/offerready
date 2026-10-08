/**
 * GET /api/me/plan  (Vercel serverless function)
 * ---------------------------------------------------------------------------
 * The signed-in user's plan and this month's usage, for the app's plan card,
 * meters and upgrade prompts. Read-only; enforcement lives in each endpoint
 * via api/_lib/plans.js checkQuota.
 *
 * Auth: Supabase bearer token (same as every other user endpoint) -> 401 without.
 *
 * 200 {
 *   plan: 'free' | 'pro',
 *   usage: { [feature]: { used: number, limit: number|null } | { used: null, limit, unknown: true } },
 *   usage_known: boolean,          // false until migration 0010 is applied / on storage errors
 *   limits: { free: {...}, pro: {...} },
 *   period_start: ISO,             // first instant of this UTC month
 *   period_end: ISO,               // when monthly counters reset
 *   plan_known: boolean            // false if the entitlement lookup itself failed
 * }
 *
 * Never fails because usage storage is missing: the plan still comes back with
 * usage marked unknown, so the app falls back to "allowed".
 */

'use strict';

const { setCors, send } = require('../_lib/http');
const { getUser } = require('../_lib/supabaseAuth');
const { getUsageSummary, LIMITS, periodStart } = require('../_lib/plans');

module.exports = async function handler(req, res) {
  setCors(res, req.headers && req.headers.origin);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { send(res, 405, { error: 'Method not allowed.' }); return; }

  const user = await getUser(req);
  if (!user) { send(res, 401, { error: 'Sign in to see your plan.' }); return; }

  try {
    const summary = await getUsageSummary(user.id);
    res.setHeader('Cache-Control', 'private, no-store');
    send(res, 200, summary);
  } catch (err) {
    // getUsageSummary already fails open internally; this is a last resort.
    console.error('[me/plan] failure:', err && err.name);
    send(res, 200, { plan: 'free', plan_known: false, usage: {}, usage_known: false, limits: LIMITS, period_start: periodStart() });
  }
};
