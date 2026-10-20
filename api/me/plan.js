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
 *   pass: { kind, kinds, starts_at, expires_at, since } | null,  // live one-time pass(es)
 *   credits: { voice_mock: number },  // mock pack credits left (never expire)
 *   mock_costs: { text, voice },      // mock credits one session costs (passes.MOCK_COSTS)
 *   billing: {
 *     options: ('job'|'pass30'|'pass90'|'pass365'|'mock10'|'monthly'|'annual')[],  // Checkout options this deployment sells
 *     portal: boolean,                           // a Stripe customer exists -> POST /api/billing/portal works
 *     pro_source: 'subscription'|'pass'|'sprint'|null,  // what currently pays for Pro
 *     pass_kind / pass_kinds: the pass in effect now / every live pass
 *     pro_expires_at: ISO|null,                  // renewal / end of the period, or the sprint's end
 *     pro_interval: 'month'|'year'|null,         // subscriptions only
 *     cancel_at_period_end: boolean
 *   }
 * }
 *
 * GET /api/me/plan?op=costs&days=30  (admins only: ADMIN_EMAILS env var)
 * GET /api/me/plan?op=metrics&days=30 (admins only) -> { days, since, metrics, costs }:
 *   people, sign-ups, events, page views, feedback, usage and passes sold
 *   (SQL function admin_metrics, migration 0019) plus the AI cost summary.
 *   200 { days, since, rows: [{ feature, calls, users, input_tokens, cached_tokens,
 *         output_tokens, cost_usd, avg_cost_usd, avg_ms, failed }] }
 *   403 for everyone else; 503 { setup: true } until migration 0017 is applied.
 * Lives here (not its own file) to stay within the Vercel Hobby function limit.
 *
 * Never fails because usage storage is missing: the plan still comes back with
 * usage marked unknown, so the app falls back to "allowed".
 */

'use strict';

const { setCors, send } = require('../_lib/http');
const { getUser } = require('../_lib/supabaseAuth');
const { getUsageSummary, LIMITS, periodStart } = require('../_lib/plans');
const billing = require('../_lib/billing');
const aiCost = require('../_lib/aiCost');
const push = require('../_lib/push');

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
    pass_kind: st ? st.passKind || null : null,
    pass_kinds: st ? st.passKinds || [] : [],
  };
}

// ---- daily question push --------------------------------------------------

function svc(extra) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Object.assign({ apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, extra || {});
}
function restUrl(path) {
  const url = process.env.SUPABASE_URL;
  return url && process.env.SUPABASE_SERVICE_ROLE_KEY ? url.replace(/\/+$/, '') + '/rest/v1' + path : null;
}

/** POST { subscription } saves this device; DELETE { endpoint } removes it. */
async function savePush(req, res, user) {
  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
  const sub = body.subscription || {};
  const endpoint = String((req.method === 'DELETE' ? body.endpoint : sub.endpoint) || '');
  if (!/^https:\/\/[^\s]{10,2000}$/.test(endpoint)) { send(res, 400, { error: 'A push subscription is required.' }); return; }
  const url = restUrl(req.method === 'DELETE'
    ? '/push_subscriptions?endpoint=eq.' + encodeURIComponent(endpoint) + '&user_id=eq.' + encodeURIComponent(user.id)
    : '/push_subscriptions?on_conflict=endpoint');
  if (!url) { send(res, 503, { error: 'Storage isn’t configured.', setup: true }); return; }
  try {
    const r = req.method === 'DELETE'
      ? await fetch(url, { method: 'DELETE', headers: svc({ Prefer: 'return=minimal' }) })
      : await fetch(url, {
        method: 'POST',
        headers: svc({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({ endpoint, user_id: user.id, p256dh: (sub.keys && sub.keys.p256dh) || null, auth: (sub.keys && sub.keys.auth) || null, fail_count: 0 }),
      });
    if (r.status === 404) { send(res, 503, { error: 'Daily notifications need a database update (migration 0018).', setup: true }); return; }
    if (!r.ok) { send(res, 502, { error: 'Couldn’t save that. Please try again.' }); return; }
    send(res, 200, { ok: true, on: req.method !== 'DELETE' });
  } catch (_e) {
    send(res, 502, { error: 'Couldn’t save that. Please try again.' });
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch (_e) { return {}; } }

/** Vercel cron (GET /api/cron/daily-question, Bearer CRON_SECRET): one push per device. */
async function dailyPush(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = (req.headers && req.headers.authorization) || '';
  if (!secret || auth !== 'Bearer ' + secret) { send(res, 401, { error: 'Unauthorized.' }); return; }
  if (!push.configured()) { send(res, 503, { error: 'VAPID keys are not set.' }); return; }
  const listUrl = restUrl('/push_subscriptions?select=endpoint,fail_count&limit=5000');
  if (!listUrl) { send(res, 503, { error: 'Storage isn’t configured.' }); return; }
  let subs = [];
  try { const r = await fetch(listUrl, { headers: svc() }); subs = r.ok ? await r.json() : []; } catch (_e) { subs = []; }
  let sent = 0, removed = 0, failed = 0;
  const now = new Date().toISOString();
  for (let i = 0; i < subs.length; i += 20) {
    await Promise.all(subs.slice(i, i + 20).map(async (s) => {
      let out;
      try { out = await push.sendPush(s.endpoint); } catch (_e) { out = { ok: false, gone: false }; }
      const where = restUrl('/push_subscriptions?endpoint=eq.' + encodeURIComponent(s.endpoint));
      try {
        if (out.gone || (!out.ok && (s.fail_count || 0) >= 4)) { removed++; await fetch(where, { method: 'DELETE', headers: svc() }); }
        else if (out.ok) { sent++; await fetch(where, { method: 'PATCH', headers: svc(), body: JSON.stringify({ last_sent_at: now, fail_count: 0 }) }); }
        else { failed++; await fetch(where, { method: 'PATCH', headers: svc(), body: JSON.stringify({ fail_count: (s.fail_count || 0) + 1 }) }); }
      } catch (_e) { /* bookkeeping is best-effort */ }
    }));
  }
  send(res, 200, { ok: true, devices: subs.length, sent, removed, failed });
}


/** All admin dashboard numbers for a period, from the admin_metrics() SQL function. */
async function adminMetrics(since) {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const resp = await fetch(url + '/rest/v1/rpc/admin_metrics', {
      method: 'POST', signal: controller.signal,
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_since: since }),
    });
    if (!resp.ok) throw new Error('admin_metrics ' + resp.status);
    return await resp.json();
  } finally { clearTimeout(timer); }
}
module.exports = async function handler(req, res) {
  setCors(res, req.headers && req.headers.origin);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  const op = req.query && req.query.op;

  // Daily question push (lives here to stay within the Hobby function limit).
  if (op === 'daily-push') { await dailyPush(req, res); return; }
  if (op === 'push-key' && req.method === 'GET') {
    if (!push.configured()) { send(res, 503, { error: 'Daily notifications aren’t set up on this deployment yet.', setup: true }); return; }
    send(res, 200, { publicKey: process.env.VAPID_PUBLIC_KEY }); return;
  }
  if (op === 'push' && (req.method === 'POST' || req.method === 'DELETE')) {
    const u = await getUser(req);
    if (!u) { send(res, 401, { error: 'Sign in to turn on daily notifications.' }); return; }
    await savePush(req, res, u); return;
  }

  if (req.method !== 'GET') { send(res, 405, { error: 'Method not allowed.' }); return; }

  const user = await getUser(req);
  if (!user) { send(res, 401, { error: 'Sign in to see your plan.' }); return; }

  if (op === 'costs') {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!aiCost.isAdmin(user.email)) { send(res, 403, { error: 'Only admins can see AI costs.' }); return; }
    try { send(res, 200, await aiCost.summary(req.query.days)); }
    catch (err) { console.error('[me/plan costs]', err && err.message); send(res, 503, { error: 'Cost log isn’t set up yet. Apply migration 0017_ai_costs.sql in Supabase.', setup: true }); }
    return;
  }

  if (op === 'metrics') {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!aiCost.isAdmin(user.email)) { send(res, 403, { error: 'Only admins can see metrics.' }); return; }
    const days = Math.max(1, Math.min(365, Math.round(Number(req.query.days) || 30)));
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const [m, costs] = await Promise.all([
      adminMetrics(since).catch((err) => { console.error('[me/plan metrics]', err && err.message); return null; }),
      aiCost.summary(days).catch(() => null),
    ]);
    if (!m) { send(res, 503, { error: 'Metrics aren’t set up yet. Apply migration 0019_admin_metrics.sql in Supabase.', setup: true, costs }); return; }
    send(res, 200, { days, since, metrics: m, costs });
    return;
  }

  try {
    const [summary, bill] = await Promise.all([getUsageSummary(user.id), billingBlock(user.id)]);
    res.setHeader('Cache-Control', 'private, no-store');
    send(res, 200, Object.assign({}, summary, { billing: bill }, aiCost.isAdmin(user.email) ? { is_admin: true } : {}));
  } catch (err) {
    // getUsageSummary already fails open internally; this is a last resort.
    console.error('[me/plan] failure:', err && err.name);
    send(res, 200, { plan: 'free', plan_known: false, usage: {}, usage_known: false, limits: LIMITS, period_start: periodStart(), billing: { options: billing.availableOptions(), portal: false, pro_source: null, pro_expires_at: null, pro_interval: null, cancel_at_period_end: false, pass_kind: null, pass_kinds: [] }, pass: null, credits: { voice_mock: 0 }, mock_costs: require('../_lib/passes').MOCK_COSTS });
  }
};
