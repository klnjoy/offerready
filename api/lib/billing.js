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

/** Grant the Pro feature bundle to a user (active, sourced from a Stripe sub). */
async function grantPro(userId, source, expiresAt) {
  const rows = PRO_FEATURES.map((feature) => ({
    user_id: userId, feature, status: 'active',
    expires_at: expiresAt || null, source: source || null,
  }));
  await rest('/entitlements?on_conflict=user_id,feature', {
    method: 'POST',
    headers: svcHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(rows),
  });
}

/** Revoke the Pro feature bundle for a user (subscription ended). */
async function revokePro(userId) {
  const list = PRO_FEATURES.map((f) => `"${f}"`).join(',');
  await rest(
    `/entitlements?user_id=eq.${encodeURIComponent(userId)}&feature=in.(${encodeURIComponent(list)})`,
    {
      method: 'PATCH',
      headers: svcHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ status: 'revoked' }),
    }
  ).catch(() => {});
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
};
