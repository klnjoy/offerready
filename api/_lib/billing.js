/**
 * api/lib/billing.js — server-side subscription + entitlement writes (Stripe).
 * ---------------------------------------------------------------------------
 * Uses the Supabase SERVICE-ROLE key (bypasses RLS) to reflect Stripe state
 * into our tables: subscriptions (mirror), entitlements (feature grants), and
 * webhook_events (idempotency ledger). Called ONLY from the webhook handler
 * after signature verification.
 *
 * Access policy (spec §13/§19): a Pro subscription grants the full set of
 * feature keys. Access is by FEATURE entitlement, never a raw plan flag. When a
 * subscription lapses, the matching entitlements are revoked (or kept until
 * period end if ACCESS_UNTIL_PERIOD_END=true — handled by the caller passing
 * the right status).
 */

'use strict';

const TIMEOUT_MS = 8000;

// Feature keys granted by a Pro subscription (mirror of the features catalog).
const PRO_FEATURES = [
  'interview_pro', 'simulator_pro', 'fde_pro', 'incident_pro',
  'system_design_pro', 'architecture_pro', 'progress_pro',
];

// Stripe subscription statuses that should grant access.
const ACTIVE_STATUSES = ['active', 'trialing', 'past_due'];

function svcHeaders(extra) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Object.assign(
    { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    extra || {}
  );
}

function restBase() {
  const url = process.env.SUPABASE_URL;
  return url ? url.replace(/\/+$/, '') + '/rest/v1' : null;
}

async function rest(path, opts) {
  const base = restBase();
  if (!base || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try { return await fetch(base + path, Object.assign({ signal: controller.signal }, opts)); }
  finally { clearTimeout(timer); }
}

/** Idempotency: record the event id; returns false if already processed. */
async function markEventOnce(event) {
  // Insert with the Stripe event id as PK. If it conflicts, we've seen it.
  const resp = await rest('/webhook_events', {
    method: 'POST',
    headers: svcHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ id: event.id, type: event.type, status: 'received', payload: event }),
  });
  if (resp.status === 409) return false;   // duplicate delivery
  return resp.ok;
}

async function finishEvent(eventId, status) {
  await rest(`/webhook_events?id=eq.${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: svcHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ status, processed_at: new Date().toISOString() }),
  }).catch(() => {});
}

/** Upsert the subscription mirror row for a user. */
async function upsertSubscription(row) {
  await rest('/subscriptions?on_conflict=stripe_subscription_id', {
    method: 'POST',
    headers: svcHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(row),
  });
}

// ---- Sprint pass (one-time, 30 days) ------------------------------------------
//
// entitlements has one row per (user_id, feature), so a subscription and a sprint
// pass can't each own their own Pro rows. Instead a sprint purchase also writes a
// MARKER row, feature='pro_sprint' (not in PRO_FEATURES, so it never grants Pro
// by itself; the features table is documentation-only, no FK), that remembers
// the pass's own expiry. The Pro rows always carry the LATER of the two
// coverages, and revokePro() falls back to the marker instead of revoking a
// still-valid pass. No migration needed.
//
// Marker source: 'sprint:<checkout session id>' or 'sprint:<cs id>|<cus id>'
// (the Stripe customer, so a sprint-only buyer can open the billing portal).

const SPRINT_FEATURE = 'pro_sprint';
const SPRINT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseSprintSource(source) {
  const m = /^sprint:([^|]*)(?:\|(.*))?$/.exec(String(source || ''));
  return m ? { sessionId: m[1] || null, customerId: m[2] || null } : { sessionId: null, customerId: null };
}

/** ISO of the later expiry; null means "no expiry" and wins. */
function laterExpiry(a, b) {
  if (a === null || b === null) return null;
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

function isLive(row, nowMs) {
  return !!row && row.status === 'active' && (row.expires_at === null || Date.parse(row.expires_at) > nowMs);
}

/** The user's Pro-bundle rows + sprint marker. Throws on storage errors. */
async function readEntitlementRows(userId) {
  const list = PRO_FEATURES.concat([SPRINT_FEATURE]).map((f) => `"${f}"`).join(',');
  const resp = await rest(
    `/entitlements?user_id=eq.${encodeURIComponent(userId)}&feature=in.(${encodeURIComponent(list)})` +
      '&select=feature,status,expires_at,source',
    { method: 'GET', headers: svcHeaders() }
  );
  if (!resp.ok) throw new Error('entitlements read ' + resp.status);
  const rows = await resp.json();
  return Array.isArray(rows) ? rows : [];
}

/**
 * The user's still-valid sprint pass, or null.
 * @returns {Promise<{ expires_at: string, source: string, sessionId: string|null, customerId: string|null }|null>}
 */
async function getSprint(userId, nowMs) {
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  const rows = await readEntitlementRows(userId);
  const m = rows.find((r) => r.feature === SPRINT_FEATURE);
  if (!m || !isLive(m, now) || !m.expires_at) return null;
  return Object.assign({ expires_at: m.expires_at, source: m.source }, parseSprintSource(m.source));
}

async function writeRows(rows) {
  const resp = await rest('/entitlements?on_conflict=user_id,feature', {
    method: 'POST',
    headers: svcHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(rows),
  });
  if (resp && resp.ok === false) throw new Error('entitlements write ' + resp.status);
}

/**
 * The longest one-time coverage the user still holds: a legacy sprint pass or
 * a pass from api/_lib/passes.js. { expires_at, source } or null. Lookup
 * failures are logged and read as "none".
 */
async function heldCoverage(userId) {
  let best = null;
  try {
    const sprint = await getSprint(userId);
    if (sprint) best = { expires_at: sprint.expires_at, source: sprint.source };
  } catch (err) { console.error('[billing] sprint lookup failed:', err && err.message); }
  try {
    const cov = await require('./passes').passCoverage(userId);
    if (cov && (!best || Date.parse(cov.expires_at) > Date.parse(best.expires_at))) best = cov;
  } catch (err) { console.error('[billing] pass lookup failed:', err && err.message); }
  return best;
}

/** Grant the Pro feature bundle to a user (active, sourced from a Stripe sub).
 * A still-valid pass that ends later than `expiresAt` keeps its later expiry
 * (the Pro rows always carry the longer coverage). */
async function grantPro(userId, source, expiresAt) {
  let exp = expiresAt || null;
  if (exp) {
    const held = await heldCoverage(userId);
    if (held && Date.parse(held.expires_at) > Date.parse(exp)) exp = held.expires_at;
  }
  const rows = PRO_FEATURES.map((feature) => ({
    user_id: userId, feature, status: 'active',
    expires_at: exp, source: source || null,
  }));
  await rest('/entitlements?on_conflict=user_id,feature', {
    method: 'POST',
    headers: svcHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(rows),
  });
}

/** Revoke the Pro feature bundle for a user (subscription ended). A still-valid
 * pass is preserved: the Pro rows fall back to the pass's expiry. */
async function revokePro(userId) {
  const held = await heldCoverage(userId);
  const list = PRO_FEATURES.map((f) => `"${f}"`).join(',');
  const patch = held
    ? { status: 'active', expires_at: held.expires_at, source: held.source }
    : { status: 'revoked' };
  await rest(
    `/entitlements?user_id=eq.${encodeURIComponent(userId)}&feature=in.(${encodeURIComponent(list)})`,
    {
      method: 'PATCH',
      headers: svcHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify(patch),
    }
  ).catch(() => {});
}

/**
 * After a pass is taken back: an active subscription keeps Pro as it is;
 * otherwise the Pro rows fall back to what's still held (revokePro).
 */
async function syncProAfterRevoke(userId, nowMs) {
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  let sub = null;
  try { sub = await latestSubscription(userId); }
  catch (err) { console.error('[billing] subscription read failed during pass revoke:', err && err.message); }
  const subLive = sub && ACTIVE_STATUSES.indexOf(sub.status) !== -1 &&
    (!sub.current_period_end || Date.parse(sub.current_period_end) > now);
  if (subLive) return;
  await revokePro(userId);
}

/**
 * Claim a key in the webhook_events ledger (the same table and PK that dedupes
 * Stripe events), so one checkout session grants at most once even when it
 * arrives in two different events (completed + async_payment_succeeded).
 * @returns {Promise<boolean>} true when fresh, false when already claimed. Throws on storage errors.
 */
async function claimOnce(key, type, payload) {
  const resp = await rest('/webhook_events', {
    method: 'POST',
    headers: svcHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ id: key, type, status: 'received', payload: payload || null }),
  });
  if (resp.status === 409) return false;
  if (!resp.ok) throw new Error('ledger insert ' + resp.status);
  return true;
}

async function releaseClaim(key) {
  await rest(`/webhook_events?id=eq.${encodeURIComponent(key)}`, {
    method: 'DELETE', headers: svcHeaders({ Prefer: 'return=minimal' }),
  }).catch(() => {});
}

/**
 * Pro rows to write so Pro lasts until `expiresAt`, or [] when the current
 * coverage (an active subscription, a longer pass, no expiry) already lasts
 * at least that long. `rows` is readEntitlementRows() output.
 */
function proRowsIfLonger(userId, rows, expiresAt, source, nowMs) {
  let proExp;
  for (const r of rows) {
    if (r.feature === SPRINT_FEATURE || !isLive(r, nowMs)) continue;
    if (PRO_FEATURES.indexOf(r.feature) === -1) continue;
    proExp = proExp === undefined ? r.expires_at : laterExpiry(proExp, r.expires_at);
  }
  const proLonger = proExp === null || (proExp !== undefined && Date.parse(proExp) >= Date.parse(expiresAt));
  if (proLonger) return [];
  return PRO_FEATURES.map((feature) => ({ user_id: userId, feature, status: 'active', expires_at: expiresAt, source }));
}

/**
 * Grant (or extend) a 30-day sprint pass for a paid one-time Checkout Session.
 * Idempotent on the session id. Buying again before the pass ends extends from
 * the current expiry, not from now.
 * @returns {Promise<{ granted: boolean, duplicate?: boolean, expires_at?: string }>}
 */
async function grantSprint(userId, sessionId, customerId, nowMs) {
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  const key = 'checkout:' + sessionId;
  const fresh = await claimOnce(key, 'sprint.granted', { session_id: sessionId, user_id: userId });
  if (!fresh) return { granted: false, duplicate: true };
  try {
    const rows = await readEntitlementRows(userId);
    const marker = rows.find((r) => r.feature === SPRINT_FEATURE);
    if (marker && parseSprintSource(marker.source).sessionId === sessionId) {
      return { granted: false, duplicate: true, expires_at: marker.expires_at };
    }
    const base = marker && isLive(marker, now) && marker.expires_at ? Math.max(now, Date.parse(marker.expires_at)) : now;
    const expiresAt = new Date(base + SPRINT_DAYS * DAY_MS).toISOString();
    const keepCustomer = customerId || (marker && parseSprintSource(marker.source).customerId) || null;
    const source = 'sprint:' + sessionId + (keepCustomer ? '|' + keepCustomer : '');

    const out = [{ user_id: userId, feature: SPRINT_FEATURE, status: 'active', expires_at: expiresAt, source }];
    await writeRows(out.concat(proRowsIfLonger(userId, rows, expiresAt, source, now)));
    return { granted: true, expires_at: expiresAt };
  } catch (err) {
    await releaseClaim(key); // let a redelivery / manual resend try again
    throw err;
  }
}

/**
 * Make the Pro bundle last until at least `expiresAt` (used by one-time
 * passes, api/_lib/passes.js). Never shortens longer coverage. Throws on
 * storage errors.
 */
async function extendPro(userId, expiresAt, source, nowMs) {
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  const rows = await readEntitlementRows(userId);
  const out = proRowsIfLonger(userId, rows, expiresAt, source, now);
  if (out.length) await writeRows(out);
  return out.length > 0;
}

// ---- Read side: /api/me/plan + /api/billing/portal ------------------------------

/** Which Checkout options this deployment sells (env-driven). One-time passes
 * and packs live in passes.js; monthly/annual subscriptions stay supported but
 * are only offered when their price env vars are set. 'sprint' is the old name
 * of the 30-day pass (accepted by checkout, never listed). */
function priceFor(option) {
  if (option === 'monthly') return process.env.STRIPE_PRO_MONTHLY_PRICE_ID || '';
  if (option === 'annual') return process.env.STRIPE_PRO_ANNUAL_PRICE_ID || '';
  if (option === 'sprint') return require('./passes').priceFor('pass30');
  return require('./passes').priceFor(option);
}

const OPTIONS = ['job', 'pass30', 'pass90', 'pass365', 'mock10', 'monthly', 'annual'];

function availableOptions() {
  if (!process.env.STRIPE_SECRET_KEY) return [];
  return OPTIONS.filter((o) => !!priceFor(o));
}

/** Latest subscription mirror row for a user, or null. Throws on storage errors. */
async function latestSubscription(userId) {
  const resp = await rest(
    `/subscriptions?user_id=eq.${encodeURIComponent(userId)}` +
      '&select=stripe_customer_id,stripe_subscription_id,stripe_price_id,status,current_period_end,cancel_at_period_end' +
      '&order=updated_at.desc&limit=1',
    { method: 'GET', headers: svcHeaders() }
  );
  if (!resp.ok) throw new Error('subscriptions read ' + resp.status);
  const rows = await resp.json();
  return (Array.isArray(rows) && rows[0]) || null;
}

/**
 * Billing state for one user. Never throws: storage errors read as "nothing
 * known" (no portal, no source), which only hides buttons.
 */
async function getBillingState(userId, nowMs) {
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  const state = {
    customerId: null, proSource: null, proExpiresAt: null, interval: null, cancelAtPeriodEnd: false,
    passKind: null, passKinds: [],
  };
  if (!userId || !restBase() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return state;
  const passes = require('./passes');
  const [sub, sprint, live, passCustomer] = await Promise.all([
    latestSubscription(userId).catch((e) => { console.error('[billing] subscription read failed:', e && e.message); return null; }),
    getSprint(userId, now).catch((e) => { console.error('[billing] sprint read failed:', e && e.message); return null; }),
    passes.livePasses(userId, now).catch((e) => { console.error('[billing] passes read failed:', e && e.message); return []; }),
    passes.lastPassCustomer(userId),
  ]);
  const pass = passes.combine(live, now);
  if (sub && sub.stripe_customer_id) state.customerId = sub.stripe_customer_id;
  else if (passCustomer) state.customerId = passCustomer;
  else if (sprint && sprint.customerId) state.customerId = sprint.customerId;

  const subLive = sub && ACTIVE_STATUSES.indexOf(sub.status) !== -1 &&
    (!sub.current_period_end || Date.parse(sub.current_period_end) > now);
  if (subLive) {
    state.proSource = 'subscription';
    state.proExpiresAt = sub.current_period_end || null;
    state.cancelAtPeriodEnd = !!sub.cancel_at_period_end;
    const annual = process.env.STRIPE_PRO_ANNUAL_PRICE_ID;
    state.interval = annual && sub.stripe_price_id === annual ? 'year' : 'month';
  } else if (pass) {
    state.proSource = 'pass';
    state.proExpiresAt = pass.ends;
    state.passKind = pass.kind;
    state.passKinds = pass.kinds;
  } else if (sprint) {
    state.proSource = 'sprint';
    state.proExpiresAt = sprint.expires_at;
  }
  return state;
}

/** Look up our user id from a Stripe subscription's metadata or our mirror. */
async function userIdFromSubscription(sub) {
  if (sub && sub.metadata && sub.metadata.user_id) return sub.metadata.user_id;
  // Fallback: find by stripe_subscription_id in our mirror.
  if (sub && sub.id) {
    const resp = await rest(
      `/subscriptions?stripe_subscription_id=eq.${encodeURIComponent(sub.id)}&select=user_id&limit=1`,
      { method: 'GET', headers: svcHeaders() }
    );
    if (resp.ok) { const rows = await resp.json(); if (Array.isArray(rows) && rows[0]) return rows[0].user_id; }
  }
  return null;
}

module.exports = {
  PRO_FEATURES,
  ACTIVE_STATUSES,
  markEventOnce,
  finishEvent,
  upsertSubscription,
  grantPro,
  revokePro,
  userIdFromSubscription,
  SPRINT_FEATURE,
  SPRINT_DAYS,
  getSprint,
  grantSprint,
  claimOnce,
  releaseClaim,
  extendPro,
  syncProAfterRevoke,
  readEntitlementRows,
  OPTIONS,
  priceFor,
  availableOptions,
  getBillingState,
  latestSubscription,
  _internal: { parseSprintSource, laterExpiry },
};
