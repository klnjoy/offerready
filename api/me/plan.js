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
 *   plan_known: boolean,           // false if the entitlement lookup itself failed
 *   billing: {
 *     options: ('monthly'|'annual'|'sprint')[],  // Checkout options this deployment sells
 *     portal: boolean,                           // a Stripe customer exists -> POST /api/billing/portal works
 *     pro_source: 'subscription'|'sprint'|null,  // what currently pays for Pro
 *     pro_expires_at: ISO|null,                  // renewal / end of the period, or the sprint's end
 *     pro_interval: 'month'|'year'|null,         // subscriptions only
 *     cancel_at_period_end: boolean
 *   }
 * }
 *
 * Never fails because usage storage is missing: the plan still comes back with
 * usage marked unknown, so the app falls back to "allowed".
 */

'use strict';

const { setCors, send } = require('../_lib/http');
const { getUser } = require('../_lib/supabaseAuth');
const { getUsageSummary, LIMITS, periodStart } = require('../_lib/plans');
const billing = require('../_lib/billing');

/** The billing block; never throws (storage errors just hide the portal). */
async function billingBlock(userId) {
  const options = billing.availableOptions();
  let st = null;
  try { st = await billing.getBillingState(userId); } catch (_) { st = null; }
  return {
    options,
    portal: !!(process.env.STRIPE_SECRET_KEY && st && st.customerId),
    pro_source: st ? st.proSource : null,
    pro_expires_at: st ? st.proExpiresAt : null,
    pro_interval: st ? st.interval : null,
    cancel_at_period_end: !!(st && st.cancelAtPeriodEnd),
  };
}

module.exports = async function handler(req, res) {
  setCors(res, req.headers && req.headers.origin);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { send(res, 405, { error: 'Method not allowed.' }); return; }

  const user = await getUser(req);
  if (!user) { send(res, 401, { error: 'Sign in to see your plan.' }); return; }

  try {
    const [summary, bill] = await Promise.all([getUsageSummary(user.id), billingBlock(user.id)]);
    res.setHeader('Cache-Control', 'private, no-store');
    send(res, 200, Object.assign({}, summary, { billing: bill }));
  } catch (err) {
    // getUsageSummary already fails open internally; this is a last resort.
    console.error('[me/plan] failure:', err && err.name);
    send(res, 200, { plan: 'free', plan_known: false, usage: {}, usage_known: false, limits: LIMITS, period_start: periodStart(), billing: { options: billing.availableOptions(), portal: false, pro_source: null, pro_expires_at: null, pro_interval: null, cancel_at_period_end: false } });
  }
};
