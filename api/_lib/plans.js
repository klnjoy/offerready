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
const passes = require('./passes');

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
 * Live one-time passes combined into one allowance (passes.combine), or null.
 * `undefined` means the lookup failed (e.g. migration 0014 not applied yet).
 */
async function passFor(userId) {
  if (!passes.configured()) return null;
  try { return passes.combine(await passes.livePasses(userId)); }
  catch (err) { logOnce('pass-lookup-failed (is migration 0014 applied?)', err && err.message); return undefined; }
}

/**
 * Resolve the plan, distinguishing "known free" from "lookup failed".
 * A user holding a live pass is 'pro' with that pass's allowance (`pass`);
 * otherwise Pro comes from entitlements (a subscription or the legacy sprint)
 * with the monthly LIMITS.pro.
 * @returns {Promise<{ plan: 'free'|'pro', known: boolean, pass: object|null }>}
 */
async function resolvePlan(userId) {
  if (!userId) return { plan: 'free', known: true, pass: null };
  const hit = planCache.get(userId);
  if (hit && Date.now() - hit.at < PLAN_TTL_MS) return { plan: hit.plan, known: true, pass: hit.pass };
  if (!configured()) { logOnce('supabase-not-configured'); return { plan: 'free', known: false, pass: null }; }

  const pass = await passFor(userId);
  if (pass) {
    planCache.set(userId, { plan: 'pro', pass, at: Date.now() });
    return { plan: 'pro', known: true, pass };
  }

  const list = PRO_FEATURES.map((f) => `"${f}"`).join(',');
  const qs =
    `user_id=eq.${encodeURIComponent(userId)}` +
    `&feature=in.(${encodeURIComponent(list)})` +
    `&status=eq.active` +
    `&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(new Date().toISOString())})` +
    `&select=feature&limit=1`;
  try {
    const resp = await rest('/entitlements?' + qs, { method: 'GET', headers: svcHeaders() });
    if (!resp.ok) { logOnce('plan-lookup-failed', resp.status); return { plan: 'free', known: false, pass: null }; }
    const rows = await resp.json();
    const plan = Array.isArray(rows) && rows.length > 0 ? 'pro' : 'free';
    planCache.set(userId, { plan, pass: null, at: Date.now() });
    return { plan, known: true, pass: null };
  } catch (err) {
    logOnce('plan-lookup-error', err && err.name);
    return { plan: 'free', known: false, pass: null };
  }
}

/** The limits and counting window that apply to a resolved plan. */
function allowanceOf(r) {
  if (r.pass) return { limits: r.pass.limits, since: r.pass.since, until: r.pass.ends };
  return { limits: LIMITS[r.plan] || LIMITS.free, since: periodStart(), until: periodEnd() };
}

/** 'free' | 'pro' (cached 60s per user). Uncertain lookups read as 'free'. */
async function getPlan(userId) {
  return (await resolvePlan(userId)).plan;
}

/**
 * This month's usage_events counts for a user, via public.usage_counts().
 * @returns {Promise<Record<string, number>|null>} null when storage is unavailable.
 */
async function monthCounts(userId, feature, since) {
  if (!configured()) { logOnce('supabase-not-configured'); return null; }
  try {
    const resp = await rest('/rpc/usage_counts', {
      method: 'POST',
      headers: svcHeaders(),
      body: JSON.stringify({ p_user: userId, p_since: since || periodStart(), p_feature: feature || null }),
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

/** Usage against the plan's own allowance (no credits). */
async function allowanceQuota(userId, feature, r) {
  const { plan, known, pass } = r;
  const { limits, since } = allowanceOf(r);
  const base = { plan, pass: pass ? pass.kind : null };
  if (!Object.prototype.hasOwnProperty.call(limits, feature)) {
    return Object.assign(base, { ok: true, used: 0, limit: null });
  }
  const limit = limits[feature];
  // Couldn't tell whether they pay: never block on our own uncertainty.
  if (!known) return Object.assign(base, { ok: true, used: 0, limit, unknown: true });
  if (limit === null) return Object.assign(base, { ok: true, used: 0, limit: null });

  let used;
  if (limit <= 0) used = 0;
  else if (feature === 'saved_jobs') {
    used = await savedJobsCount(userId);
  } else {
    const counts = await monthCounts(userId, feature, since);
    used = counts ? (counts[feature] || 0) : null;
  }
  if (used === null) return Object.assign(base, { ok: true, used: 0, limit, unknown: true });
  return Object.assign(base, { ok: used < limit, used, limit });
}

/**
 * May `userId` use `feature` once more? Counts this month on Free / a
 * subscription, or since the pass started on a pass. When the allowance is
 * used up, credit-pack features (voice_mock) fall back to the credit balance.
 * @returns {Promise<{ ok, plan, used, limit, pass, unknown?, credit?, credits? }>}
 */
async function checkQuota(userId, feature) {
  const r = await resolvePlan(userId);
  const q = await allowanceQuota(userId, feature, r);
  if (q.ok || passes.CREDIT_FEATURES.indexOf(feature) === -1) return q;
  const bal = await passes.creditBalance(userId);
  const credits = bal ? (bal[feature] || 0) : 0;
  if (credits > 0) return Object.assign(q, { ok: true, credit: true, credits });
  return Object.assign(q, { credits });
}

/** Record one successful use. Never throws; errors log once. */
async function recordUse(userId, feature) {
  if (!userId || METERED.indexOf(feature) === -1) return;
  if (!configured()) { logOnce('supabase-not-configured'); return; }
  // Past the plan's allowance, this use was paid for with a pack credit.
  if (passes.CREDIT_FEATURES.indexOf(feature) !== -1) {
    try {
      const q = await allowanceQuota(userId, feature, await resolvePlan(userId));
      if (!q.unknown && q.limit !== null && q.used >= q.limit) await passes.spendCredit(userId, feature);
    } catch (err) { logOnce('credit-spend-error', err && err.name); }
  }
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

function passLabel(kind) { return (passes.PASSES[kind] && passes.PASSES[kind].label) || 'pass'; }

/** Friendly explanation for an over-quota result. */
function quotaMessage(q, feature) {
  const planName = q.plan === 'pro' ? 'Pro' : 'Free';
  const pack = passes.CREDIT_FEATURES.indexOf(feature) !== -1;
  if (feature === 'saved_jobs') {
    if (q.pass) return `Your ${passLabel(q.pass)} includes ${q.limit} ${nounFor(feature, q.limit)}. Delete one you no longer need, or get a bigger pass.`;
    return `Free includes ${q.limit} ${nounFor(feature, q.limit)}. Get a pass to save more, or delete one you no longer need.`;
  }
  if (!q.limit) {
    return `${nounFor(feature, 2).replace(/^./, (c) => c.toUpperCase())} come with any pass.`;
  }
  if (q.pass) {
    return `You've used all ${q.limit} ${nounFor(feature, q.limit)} in your ${passLabel(q.pass)}. ${pack ? 'Add a mock pack for more.' : 'Buy another pass to add more.'}`;
  }
  if (q.plan === 'pro') {
    return `You've reached this month's fair-use limit of ${q.limit} ${nounFor(feature, q.limit)} on Pro. It resets on the 1st (UTC).${pack ? ' Add a mock pack for more now.' : ''}`;
  }
  return `You've used ${q.used} of ${q.limit} ${nounFor(feature, 2)} this month on ${planName}. ${pack ? 'Get a pass or a mock pack for more.' : 'Get a pass for more.'}`;
}

/**
 * The 403 body for an over-quota result. `upgrade` is true when buying
 * something helps (Free, a pass, or a feature a mock pack tops up); a
 * subscriber at a monthly fair-use cap gets the reset time instead.
 */
function quotaError(q, feature) {
  const pack = passes.CREDIT_FEATURES.indexOf(feature) !== -1;
  const body = {
    error: quotaMessage(q, feature),
    upgrade: q.plan !== 'pro' || !!q.pass || pack,
    feature,
    used: q.used,
    limit: q.limit,
    plan: q.plan,
  };
  if (q.pass) body.pass = q.pass;
  if (pack) body.pack = true;
  if (feature !== 'saved_jobs' && !q.pass) body.resets_at = periodEnd();
  return body;
}

/**
 * Everything the account screen needs, in as few calls as possible:
 * one entitlement read (cached), one usage_counts RPC, one jobs count.
 * If usage storage is unavailable, each usage entry is { used: null, limit, unknown: true }.
 */
async function getUsageSummary(userId) {
  const r = await resolvePlan(userId);
  const { plan, known, pass } = r;
  const { limits, since, until } = allowanceOf(r);
  const [counts, jobs, credits] = await Promise.all([
    monthCounts(userId, null, since), savedJobsCount(userId), passes.creditBalance(userId),
  ]);
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
  const passLimits = {};
  for (const k of passes.PASS_KINDS) passLimits[k] = passes.PASSES[k].limits;
  return {
    plan,
    plan_known: known,
    usage,
    usage_known: usageKnown,
    limits: { free: LIMITS.free, pro: LIMITS.pro, passes: passLimits },
    period_start: since,
    period_end: until,
    pass: pass ? { kind: pass.kind, kinds: pass.kinds, starts_at: pass.starts_at, expires_at: pass.ends, since: pass.since } : null,
    credits: credits || { voice_mock: 0 },
  };
}

function _reset() { planCache.clear(); logged.clear(); }

module.exports = {
  LIMITS, getPlan, checkQuota, recordUse,
  quotaError, quotaMessage, getUsageSummary, periodStart, periodEnd, METERED,
  _internal: { _reset, planCache, resolvePlan, allowanceQuota },
};
