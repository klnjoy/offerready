/**
 * api/_lib/plans.js — Free vs Pro limits, enforced server-side.
 *
 * CONTRACT (other endpoints call these; keep signatures stable):
 *   LIMITS                      { free: {feature: number|null}, pro: {...} }
 *   getPlan(userId)             -> Promise<'free'|'pro'>
 *   checkQuota(userId, feature) -> Promise<{ ok, plan, used, limit }>
 *   recordUse(userId, feature)  -> Promise<void>
 * Fails safe: if usage storage is unavailable, checkQuota allows the request
 * (never locks paying or free users out because of our own outage) and logs.
 *
 * Extras used by /api/me/plan and the endpoints:
 *   quotaError(q, feature)      -> the 403 body { error, upgrade, feature, used, limit, plan }
 *   getUsageSummary(userId)     -> { plan, usage, limits, period_start, usage_known }
 *   periodStart(now?)           -> ISO string of the current UTC calendar month start
 *
 * Storage:
 *   - Plan: a user is Pro when they hold ANY active (unexpired) entitlement from
 *     the Pro bundle the Stripe webhook grants (billing.js PRO_FEATURES). One
 *     PostgREST query, cached per user for 60s in this instance's memory.
 *   - Usage: rows in public.usage_events (migration 0010), counted for the
 *     current UTC month via the SQL function public.usage_counts(). Saved jobs
 *     are NOT events: they are the number of rows in public.jobs (countJobs).
 *   - All reads/writes use the SERVICE-ROLE key via fetch, like entitlements.js.
 *
 * Failure posture (deliberately different from entitlements.js, which fails
 * closed for premium CONTENT): quotas are a cost guard, not an authorization
 * boundary, so any storage error ALLOWS the request and logs once per kind.
 * If the plan lookup itself errors we don't know whether the user pays, so we
 * also allow (and don't cache the uncertain answer).
 */
'use strict';

const { PRO_FEATURES } = require('./billing');
const { countJobs } = require('./jobs');

// Monthly limits (calendar month, UTC). null = unlimited. Pro limits are
// fair-use caps that protect AI cost; a real user rarely reaches them.
const LIMITS = {
  free: { saved_jobs: 1, analyses: 3, ai_grading: 5, voice_mock: 1, custom_scenarios: 0, premium_scenarios: 0, story_ai: 3, prep_plan: null, resume_tailor: 2 },
  pro:  { saved_jobs: null, analyses: 60, ai_grading: 400, voice_mock: 40, custom_scenarios: 40, premium_scenarios: null, story_ai: 150, prep_plan: null, resume_tailor: 100 },
};

// Features counted as monthly usage_events (saved_jobs counts jobs rows;
// premium_scenarios is a library gate checked by entitlement in [slug].js;
// prep_plan is unlimited on both plans). resume_tailor needs migration 0011
// (the usage_events CHECK constraint); before it runs, recordUse's insert is
// rejected, logged once and ignored, so tailoring still works (uncounted).
const METERED = ['analyses', 'ai_grading', 'voice_mock', 'custom_scenarios', 'story_ai', 'resume_tailor'];

// Human wording for limit messages: [singular, plural].
const NOUNS = {
  saved_jobs: ['saved job', 'saved jobs'],
  analyses: ['job analysis', 'job analyses'],
  ai_grading: ['AI answer grading', 'AI answer gradings'],
  voice_mock: ['voice session', 'voice sessions'],
  custom_scenarios: ['custom scenario', 'custom scenarios'],
  premium_scenarios: ['premium scenario', 'premium scenarios'],
  story_ai: ['story coaching session', 'story coaching sessions'],
  prep_plan: ['prep plan', 'prep plans'],
  resume_tailor: ['resume tailoring run', 'resume tailoring runs'],
};

const TIMEOUT_MS = 6000;
const PLAN_TTL_MS = 60 * 1000;

const planCache = new Map(); // userId -> { plan, at }
const logged = new Set();

function logOnce(kind, detail) {
  if (logged.has(kind)) return;
  logged.add(kind);
  console.error(`[plans] ${kind} — failing open (requests allowed).`, detail || '');
}

function restBase() {
  const url = process.env.SUPABASE_URL;
  return url ? url.replace(/\/+$/, '') + '/rest/v1' : null;
}

function svcHeaders(extra) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Object.assign(
    { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    extra || {}
  );
}

function configured() {
  return !!(restBase() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function rest(path, opts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try { return await fetch(restBase() + path, Object.assign({ signal: controller.signal }, opts)); }
  finally { clearTimeout(timer); }
}

/** First instant of the current calendar month in UTC, as an ISO string. */
function periodStart(now) {
  const d = now instanceof Date ? now : new Date(typeof now === 'number' ? now : Date.now());
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

/** First instant of next month (UTC) — when monthly counters reset. */
function periodEnd(now) {
  const d = now instanceof Date ? now : new Date(typeof now === 'number' ? now : Date.now());
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
}

/**
 * Resolve the plan, distinguishing "known free" from "lookup failed".
 * @returns {Promise<{ plan: 'free'|'pro', known: boolean }>}
 */
async function resolvePlan(userId) {
  if (!userId) return { plan: 'free', known: true };
  const hit = planCache.get(userId);
  if (hit && Date.now() - hit.at < PLAN_TTL_MS) return { plan: hit.plan, known: true };
  if (!configured()) { logOnce('supabase-not-configured'); return { plan: 'free', known: false }; }

  const list = PRO_FEATURES.map((f) => `"${f}"`).join(',');
  const qs =
    `user_id=eq.${encodeURIComponent(userId)}` +
    `&feature=in.(${encodeURIComponent(list)})` +
    `&status=eq.active` +
    `&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(new Date().toISOString())})` +
    `&select=feature&limit=1`;
  try {
    const resp = await rest('/entitlements?' + qs, { method: 'GET', headers: svcHeaders() });
    if (!resp.ok) { logOnce('plan-lookup-failed', resp.status); return { plan: 'free', known: false }; }
    const rows = await resp.json();
    const plan = Array.isArray(rows) && rows.length > 0 ? 'pro' : 'free';
    planCache.set(userId, { plan, at: Date.now() });
    return { plan, known: true };
  } catch (err) {
    logOnce('plan-lookup-error', err && err.name);
    return { plan: 'free', known: false };
  }
}

/** 'free' | 'pro' (cached 60s per user). Uncertain lookups read as 'free'. */
async function getPlan(userId) {
  return (await resolvePlan(userId)).plan;
}

/**
 * This month's usage_events counts for a user, via public.usage_counts().
 * @returns {Promise<Record<string, number>|null>} null when storage is unavailable.
 */
async function monthCounts(userId, feature) {
  if (!configured()) { logOnce('supabase-not-configured'); return null; }
  try {
    const resp = await rest('/rpc/usage_counts', {
      method: 'POST',
      headers: svcHeaders(),
      body: JSON.stringify({ p_user: userId, p_since: periodStart(), p_feature: feature || null }),
    });
    if (!resp.ok) { logOnce('usage-count-failed (is migration 0010 applied?)', resp.status); return null; }
    const rows = await resp.json();
    if (!Array.isArray(rows)) { logOnce('usage-count-bad-body'); return null; }
    const out = {};
    for (const r of rows) {
      if (r && typeof r.feature === 'string') out[r.feature] = Number(r.used) || 0;
    }
    return out;
  } catch (err) {
    logOnce('usage-count-error', err && err.name);
    return null;
  }
}

/** Saved jobs = rows in public.jobs (same query jobs/index.js always used). null on error. */
async function savedJobsCount(userId) {
  if (!configured()) return null;
  try { return await countJobs(userId); }
  catch (err) { logOnce('jobs-count-error', err && err.name); return null; }
}

/**
 * May `userId` use `feature` once more this month?
 * @returns {Promise<{ ok: boolean, plan: 'free'|'pro', used: number, limit: number|null, unknown?: boolean }>}
 */
async function checkQuota(userId, feature) {
  const { plan, known } = await resolvePlan(userId);
  const limits = LIMITS[plan] || LIMITS.free;
  if (!Object.prototype.hasOwnProperty.call(limits, feature)) {
    return { ok: true, plan, used: 0, limit: null };
  }
  const limit = limits[feature];
  // Couldn't tell whether they pay: never block on our own uncertainty.
  if (!known) return { ok: true, plan, used: 0, limit, unknown: true };
  if (limit === null) return { ok: true, plan, used: 0, limit: null };
  if (limit <= 0) return { ok: false, plan, used: 0, limit };

  let used;
  if (feature === 'saved_jobs') {
    used = await savedJobsCount(userId);
  } else {
    const counts = await monthCounts(userId, feature);
    used = counts ? (counts[feature] || 0) : null;
  }
  if (used === null) return { ok: true, plan, used: 0, limit, unknown: true };
  return { ok: used < limit, plan, used, limit };
}

/** Record one successful use. Never throws; errors log once. */
async function recordUse(userId, feature) {
  if (!userId || METERED.indexOf(feature) === -1) return;
  if (!configured()) { logOnce('supabase-not-configured'); return; }
  try {
    const resp = await rest('/usage_events', {
      method: 'POST',
      headers: svcHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ user_id: userId, feature }),
    });
    if (!resp.ok) logOnce('usage-record-failed (is migration 0010 applied?)', resp.status);
  } catch (err) {
    logOnce('usage-record-error', err && err.name);
  }
}

function nounFor(feature, n) {
  const w = NOUNS[feature] || [String(feature).replace(/_/g, ' '), String(feature).replace(/_/g, ' ')];
  return n === 1 ? w[0] : w[1];
}

/** Friendly explanation for an over-quota result. */
function quotaMessage(q, feature) {
  const planName = q.plan === 'pro' ? 'Pro' : 'Free';
  if (feature === 'saved_jobs') {
    return `Free includes ${q.limit} ${nounFor(feature, q.limit)}. Upgrade to Pro to save more, or delete one you no longer need.`;
  }
  if (!q.limit) {
    return `${nounFor(feature, 2).replace(/^./, (c) => c.toUpperCase())} are part of OfferReady Pro.`;
  }
  if (q.plan === 'pro') {
    return `You've reached this month's fair-use limit of ${q.limit} ${nounFor(feature, q.limit)} on Pro. It resets on the 1st (UTC).`;
  }
  return `You've used ${q.used} of ${q.limit} ${nounFor(feature, 2)} this month on ${planName}. Upgrade to Pro for more.`;
}

/**
 * The 403 body for an over-quota result. `upgrade` is true on Free (the app
 * shows an upgrade prompt); a Pro user at a fair-use cap gets upgrade:false
 * and the reset time instead, since there is nothing to upgrade to.
 */
function quotaError(q, feature) {
  const body = {
    error: quotaMessage(q, feature),
    upgrade: q.plan !== 'pro',
    feature,
    used: q.used,
    limit: q.limit,
    plan: q.plan,
  };
  if (feature !== 'saved_jobs') body.resets_at = periodEnd();
  return body;
}

/**
 * Everything the account screen needs, in as few calls as possible:
 * one entitlement read (cached), one usage_counts RPC, one jobs count.
 * If usage storage is unavailable, each usage entry is { used: null, limit, unknown: true }.
 */
async function getUsageSummary(userId) {
  const { plan, known } = await resolvePlan(userId);
  const limits = LIMITS[plan];
  const [counts, jobs] = await Promise.all([monthCounts(userId, null), savedJobsCount(userId)]);
  const usage = {};
  let usageKnown = !!counts && jobs !== null;
  for (const f of Object.keys(limits)) {
    let used;
    if (f === 'saved_jobs') used = jobs;
    else if (METERED.indexOf(f) !== -1) used = counts ? (counts[f] || 0) : null;
    else used = 0; // gates / unlimited features are not metered
    usage[f] = used === null ? { used: null, limit: limits[f], unknown: true } : { used, limit: limits[f] };
  }
  if (!known) usageKnown = false;
  return {
    plan,
    plan_known: known,
    usage,
    usage_known: usageKnown,
    limits: { free: LIMITS.free, pro: LIMITS.pro },
    period_start: periodStart(),
    period_end: periodEnd(),
  };
}

function _reset() { planCache.clear(); logged.clear(); }

module.exports = {
  LIMITS, getPlan, checkQuota, recordUse,
  quotaError, quotaMessage, getUsageSummary, periodStart, periodEnd, METERED,
  _internal: { _reset, planCache, resolvePlan },
};
