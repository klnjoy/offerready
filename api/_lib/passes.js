/**
 * api/_lib/passes.js — one-time passes and mock-interview credit packs.
 * ---------------------------------------------------------------------------
 * Pricing model: no auto-renew. A pass is paid once and covers a fixed number
 * of days with a fixed allowance for its WHOLE length (not per month), so AI
 * cost per pass is bounded. Buying again before a pass ends starts the new
 * pass when the current one ends (no days lost); its allowance is usable
 * straight away. Mock packs add voice mock interview credits that never
 * expire and are spent only after the plan's own allowance runs out.
 *
 * Storage (migration 0014): public.passes and public.credit_ledger, written
 * only here with the service-role key, from the verified Stripe webhook.
 * Prices come from env (one Stripe one-time Price per option):
 *   STRIPE_PASS_JOB_PRICE_ID, STRIPE_PASS_30_PRICE_ID (falls back to the old
 *   STRIPE_SPRINT_PRICE_ID), STRIPE_PASS_90_PRICE_ID, STRIPE_PASS_365_PRICE_ID,
 *   STRIPE_MOCK_PACK_PRICE_ID.
 *
 * A pass also keeps the Pro entitlement rows valid until it ends
 * (billing.extendPro), so premium content gates keep working unchanged.
 */

'use strict';

const TIMEOUT_MS = 8000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Allowance for the whole pass. null = unlimited. saved_jobs is a cap on how
// many jobs can be saved at once, not a count of uses.
const PASSES = {
  job: {
    days: 45, label: 'Job pass',
    limits: { saved_jobs: 1, analyses: 10, ai_grading: 100, voice_mock: 4, custom_scenarios: 5, premium_scenarios: null, story_ai: 20, prep_plan: null, resume_tailor: 10 },
  },
  pass30: {
    days: 30, label: '30-day pass',
    limits: { saved_jobs: 5, analyses: 30, ai_grading: 250, voice_mock: 8, custom_scenarios: 15, premium_scenarios: null, story_ai: 50, prep_plan: null, resume_tailor: 30 },
  },
  pass90: {
    days: 90, label: '90-day pass',
    limits: { saved_jobs: 15, analyses: 80, ai_grading: 600, voice_mock: 20, custom_scenarios: 40, premium_scenarios: null, story_ai: 120, prep_plan: null, resume_tailor: 80 },
  },
  pass365: {
    days: 365, label: '1-year pass',
    limits: { saved_jobs: 40, analyses: 200, ai_grading: 1500, voice_mock: 40, custom_scenarios: 100, premium_scenarios: null, story_ai: 300, prep_plan: null, resume_tailor: 200 },
  },
};
const PASS_KINDS = Object.keys(PASSES);

const PACKS = {
  mock10: { feature: 'voice_mock', amount: 10, label: '10 extra mock interviews' },
};
const PACK_KINDS = Object.keys(PACKS);

// Features that credit packs can top up.
const CREDIT_FEATURES = ['voice_mock'];

function isPass(option) { return PASS_KINDS.indexOf(option) !== -1; }
function isPack(option) { return PACK_KINDS.indexOf(option) !== -1; }

/** A Stripe Price id, or '' for anything else (placeholders like "30" or "0"
 * mean "not set up yet", so that option isn't offered). */
function validPrice(v) {
  const t = String(v || '').trim();
  return /^price_[A-Za-z0-9]+$/.test(t) ? t : '';
}

function priceFor(option) {
  const env = process.env;
  switch (option) {
    case 'job': return validPrice(env.STRIPE_PASS_JOB_PRICE_ID);
    case 'pass30': return validPrice(env.STRIPE_PASS_30_PRICE_ID) || validPrice(env.STRIPE_SPRINT_PRICE_ID);
    case 'pass90': return validPrice(env.STRIPE_PASS_90_PRICE_ID);
    case 'pass365': return validPrice(env.STRIPE_PASS_365_PRICE_ID);
    case 'mock10': return validPrice(env.STRIPE_MOCK_PACK_PRICE_ID);
    default: return '';
  }
}

// ---- storage -----------------------------------------------------------------

function restBase() {
  const url = process.env.SUPABASE_URL;
  return url ? url.replace(/\/+$/, '') + '/rest/v1' : null;
}

function configured() { return !!(restBase() && process.env.SUPABASE_SERVICE_ROLE_KEY); }

function svcHeaders(extra) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Object.assign({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, extra || {});
}

async function rest(path, opts) {
  if (!configured()) throw new Error('Supabase not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try { return await fetch(restBase() + path, Object.assign({ signal: controller.signal }, opts)); }
  finally { clearTimeout(timer); }
}

/** Passes that haven't ended yet (including queued ones), oldest first. Throws on storage errors. */
async function livePasses(userId, nowMs) {
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  const resp = await rest(
    `/passes?user_id=eq.${encodeURIComponent(userId)}` +
      `&expires_at=gt.${encodeURIComponent(new Date(now).toISOString())}` +
      '&select=kind,starts_at,expires_at,stripe_customer_id&order=starts_at.asc',
    { method: 'GET', headers: svcHeaders() }
  );
  if (!resp.ok) throw new Error('passes read ' + resp.status);
  const rows = await resp.json();
  return Array.isArray(rows) ? rows.filter((r) => r && isPass(r.kind)) : [];
}

/**
 * Combine live passes into one allowance:
 *   limits  sum per feature (null = unlimited wins)
 *   since   usage counts from the start of the earliest live pass
 *   ends    when the last pass ends
 *   kind    the pass in effect now (the queued ones are listed in `kinds`)
 * @returns {null | { kind, kinds, since, starts_at, ends, limits }}
 */
function combine(rows, nowMs) {
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  if (!rows || rows.length === 0) return null;
  const limits = {};
  let since = null;
  let ends = null;
  let current = null;
  for (const r of rows) {
    const def = PASSES[r.kind];
    for (const f of Object.keys(def.limits)) {
      const v = def.limits[f];
      if (!(f in limits)) limits[f] = v;
      else if (limits[f] === null || v === null) limits[f] = null;
      else limits[f] += v;
    }
    const s = Date.parse(r.starts_at);
    const e = Date.parse(r.expires_at);
    if (since === null || s < since) since = s;
    if (ends === null || e > ends) ends = e;
    if (!current && s <= now && e > now) current = r;
  }
  const head = current || rows[0];
  return {
    kind: head.kind,
    kinds: rows.map((r) => r.kind),
    since: new Date(Math.min(since, now)).toISOString(),
    starts_at: head.starts_at,
    ends: new Date(ends).toISOString(),
    limits,
  };
}

/** Pro coverage from passes: { expires_at, source } or null. Throws on storage errors. */
async function passCoverage(userId, nowMs) {
  if (!configured()) return null;
  const rows = await livePasses(userId, nowMs);
  const c = combine(rows, nowMs);
  return c ? { expires_at: c.ends, source: 'pass:' + c.kind } : null;
}

/** The latest Stripe customer id seen on a pass, or null. Never throws. */
async function lastPassCustomer(userId) {
  if (!configured()) return null;
  try {
    const resp = await rest(
      `/passes?user_id=eq.${encodeURIComponent(userId)}&stripe_customer_id=not.is.null` +
        '&select=stripe_customer_id&order=created_at.desc&limit=1',
      { method: 'GET', headers: svcHeaders() }
    );
    if (!resp.ok) return null;
    const rows = await resp.json();
    return (Array.isArray(rows) && rows[0] && rows[0].stripe_customer_id) || null;
  } catch (_) { return null; }
}

/** { voice_mock: n } credit balances, or null when unavailable. Never throws. */
async function creditBalance(userId) {
  if (!configured()) return null;
  try {
    const resp = await rest('/rpc/credit_balance', {
      method: 'POST', headers: svcHeaders(), body: JSON.stringify({ p_user: userId }),
    });
    if (!resp.ok) return null;
    const rows = await resp.json();
    if (!Array.isArray(rows)) return null;
    const out = {};
    for (const f of CREDIT_FEATURES) out[f] = 0;
    for (const r of rows) if (r && CREDIT_FEATURES.indexOf(r.feature) !== -1) out[r.feature] = Math.max(0, Number(r.balance) || 0);
    return out;
  } catch (_) { return null; }
}

/** Spend one credit. Never throws (a failed debit only means one free use). */
async function spendCredit(userId, feature) {
  if (!configured() || CREDIT_FEATURES.indexOf(feature) === -1) return false;
  try {
    const resp = await rest('/credit_ledger', {
      method: 'POST',
      headers: svcHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ user_id: userId, feature, delta: -1, source: 'use' }),
    });
    if (!resp.ok) console.error('[passes] credit debit failed', resp.status);
    return resp.ok;
  } catch (err) {
    console.error('[passes] credit debit error', err && err.name);
    return false;
  }
}

// ---- grants (webhook only) -----------------------------------------------------

/**
 * Record a paid pass. Idempotent on the Checkout Session id. A pass bought
 * while another is live starts when the last live one ends.
 * @returns {Promise<{ granted: boolean, duplicate?: boolean, starts_at?: string, expires_at?: string }>}
 */
async function grantPass(userId, kind, sessionId, customerId, nowMs) {
  if (!isPass(kind)) throw new Error('unknown pass ' + kind);
  const billing = require('./billing');
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  const key = 'checkout:' + sessionId;
  const fresh = await billing.claimOnce(key, 'pass.granted', { session_id: sessionId, user_id: userId, kind });
  if (!fresh) return { granted: false, duplicate: true };
  try {
    const rows = await livePasses(userId, now);
    let start = now;
    for (const r of rows) start = Math.max(start, Date.parse(r.expires_at));
    const startsAt = new Date(start).toISOString();
    const expiresAt = new Date(start + PASSES[kind].days * DAY_MS).toISOString();
    const resp = await rest('/passes', {
      method: 'POST',
      headers: svcHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        user_id: userId, kind, starts_at: startsAt, expires_at: expiresAt,
        stripe_session_id: sessionId, stripe_customer_id: customerId || null,
      }),
    });
    if (resp.status === 409) return { granted: false, duplicate: true };
    if (!resp.ok) throw new Error('passes insert ' + resp.status);
    await billing.extendPro(userId, expiresAt, 'pass:' + sessionId, now);
    return { granted: true, starts_at: startsAt, expires_at: expiresAt };
  } catch (err) {
    await billing.releaseClaim(key);
    throw err;
  }
}

/** Record a paid credit pack. Idempotent on the Checkout Session id. */
async function grantPack(userId, kind, sessionId) {
  if (!isPack(kind)) throw new Error('unknown pack ' + kind);
  const billing = require('./billing');
  const key = 'checkout:' + sessionId;
  const fresh = await billing.claimOnce(key, 'pack.granted', { session_id: sessionId, user_id: userId, kind });
  if (!fresh) return { granted: false, duplicate: true };
  try {
    const pack = PACKS[kind];
    const resp = await rest('/credit_ledger', {
      method: 'POST',
      headers: svcHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ user_id: userId, feature: pack.feature, delta: pack.amount, source: 'pack:' + kind, stripe_session_id: sessionId }),
    });
    if (resp.status === 409) return { granted: false, duplicate: true };
    if (!resp.ok) throw new Error('credit insert ' + resp.status);
    return { granted: true, feature: pack.feature, amount: pack.amount };
  } catch (err) {
    await billing.releaseClaim(key);
    throw err;
  }
}

// ---- take back (refund / dispute; webhook only) -----------------------------------

/**
 * End the pass bought in `sessionId` after a full refund or a dispute: delete
 * it, move any queued passes up so they start now or when the previous one
 * ends, then let billing.syncProAfterRevoke trim the Pro rows. Idempotent.
 * @returns {Promise<{ revoked: boolean, duplicate?: boolean }>}
 */
async function revokePass(userId, sessionId, reason, nowMs) {
  const billing = require('./billing');
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  const key = 'revoke:' + sessionId;
  const fresh = await billing.claimOnce(key, 'pass.revoked', { session_id: sessionId, user_id: userId, reason });
  if (!fresh) return { revoked: false, duplicate: true };
  try {
    const del = await rest(`/passes?stripe_session_id=eq.${encodeURIComponent(sessionId)}`, {
      method: 'DELETE', headers: svcHeaders({ Prefer: 'return=minimal' }),
    });
    if (!del.ok) throw new Error('passes delete ' + del.status);
    // Re-chain the passes still to come so there's no gap where the removed one was.
    const resp = await rest(
      `/passes?user_id=eq.${encodeURIComponent(userId)}&expires_at=gt.${encodeURIComponent(new Date(now).toISOString())}` +
        '&select=kind,starts_at,expires_at,stripe_session_id&order=starts_at.asc',
      { method: 'GET', headers: svcHeaders() }
    );
    if (!resp.ok) throw new Error('passes read ' + resp.status);
    const rows = (await resp.json()) || [];
    let prevEnd = now;
    for (const r of rows) {
      const s0 = Date.parse(r.starts_at);
      if (s0 <= now) { prevEnd = Math.max(prevEnd, Date.parse(r.expires_at)); continue; }
      const start = Math.max(now, prevEnd);
      if (start < s0 && r.stripe_session_id && isPass(r.kind)) {
        const end = start + PASSES[r.kind].days * DAY_MS;
        const up = await rest(`/passes?stripe_session_id=eq.${encodeURIComponent(r.stripe_session_id)}`, {
          method: 'PATCH', headers: svcHeaders({ Prefer: 'return=minimal' }),
          body: JSON.stringify({ starts_at: new Date(start).toISOString(), expires_at: new Date(end).toISOString() }),
        });
        if (!up.ok) throw new Error('passes update ' + up.status);
        prevEnd = end;
      } else {
        prevEnd = Math.max(prevEnd, Date.parse(r.expires_at));
      }
    }
    await billing.syncProAfterRevoke(userId);
    return { revoked: true };
  } catch (err) {
    await billing.releaseClaim(key);
    throw err;
  }
}

/** Take back a refunded or disputed pack's credits (the balance may go below zero). Idempotent. */
async function revokePack(userId, kind, sessionId, reason) {
  if (!isPack(kind)) throw new Error('unknown pack ' + kind);
  const billing = require('./billing');
  const key = 'revoke:' + sessionId;
  const fresh = await billing.claimOnce(key, 'pack.revoked', { session_id: sessionId, user_id: userId, reason });
  if (!fresh) return { revoked: false, duplicate: true };
  try {
    const pack = PACKS[kind];
    const resp = await rest('/credit_ledger', {
      method: 'POST',
      headers: svcHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ user_id: userId, feature: pack.feature, delta: -pack.amount, source: reason + ':' + sessionId }),
    });
    if (!resp.ok) throw new Error('credit insert ' + resp.status);
    return { revoked: true };
  } catch (err) {
    await billing.releaseClaim(key);
    throw err;
  }
}

module.exports = {
  PASSES, PASS_KINDS, PACKS, PACK_KINDS, CREDIT_FEATURES, DAY_MS,
  isPass, isPack, priceFor, validPrice,
  livePasses, combine, passCoverage, lastPassCustomer,
  creditBalance, spendCredit,
  grantPass, grantPack, revokePass, revokePack,
  configured,
};
