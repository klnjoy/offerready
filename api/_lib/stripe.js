/**
 * api/lib/stripe.js — minimal Stripe helpers (no SDK dependency).
 * ---------------------------------------------------------------------------
 * Talks to the Stripe REST API with global fetch and form-encoded bodies, and
 * verifies webhook signatures with Node's crypto. Keeping this dependency-free
 * matches the rest of the backend (which uses raw fetch) and avoids shipping a
 * package the Vercel Node runtime would have to bundle.
 *
 * SECURITY (spec §15/§17):
 *   - STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are SERVER-ONLY env vars.
 *   - Webhook payloads are verified against the signing secret BEFORE trust.
 *   - Card data never touches our servers — Checkout is hosted by Stripe.
 */

'use strict';

const crypto = require('crypto');

const STRIPE_API = 'https://api.stripe.com/v1';
const TIMEOUT_MS = 10000;

function secretKey() { return process.env.STRIPE_SECRET_KEY; }

// Pin the API version so a change to the account's default version can't
// change the shape of what Stripe sends back. Set the webhook endpoint in the
// Dashboard to the same version. Override with STRIPE_API_VERSION.
const DEFAULT_API_VERSION = '2025-03-31.basil';
function apiVersion() { return (process.env.STRIPE_API_VERSION || '').trim() || DEFAULT_API_VERSION; }

/** Encode a flat/nested object into application/x-www-form-urlencoded (Stripe style). */
function formEncode(obj, prefix, out) {
  out = out || [];
  Object.keys(obj).forEach((k) => {
    const v = obj[k];
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v == null) return;
    if (typeof v === 'object' && !Array.isArray(v)) formEncode(v, key, out);
    else if (Array.isArray(v)) v.forEach((item, i) => {
      if (typeof item === 'object') formEncode(item, `${key}[${i}]`, out);
      else out.push(`${key}[${i}]=${encodeURIComponent(item)}`);
    });
    else out.push(`${key}=${encodeURIComponent(v)}`);
  });
  return out;
}

async function stripePost(path, params, opts) {
  const key = secretKey();
  if (!key) throw new Error('Stripe not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(STRIPE_API + path, {
      method: 'POST',
      signal: controller.signal,
      headers: Object.assign({
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': apiVersion(),
      }, opts && opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
      body: formEncode(params).join('&'),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = (data && data.error && data.error.message) || `Stripe ${resp.status}`;
      const err = new Error(msg);
      err.status = resp.status;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function stripeGet(path) {
  const key = secretKey();
  if (!key) throw new Error('Stripe not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(STRIPE_API + path, {
      method: 'GET',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, 'Stripe-Version': apiVersion() },
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) { const e = new Error(`Stripe ${resp.status}`); e.status = resp.status; throw e; }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Create a Checkout Session for a price + user.
 *   mode 'subscription' (default): monthly / annual Pro.
 *   mode 'payment': the one-time 30-day Sprint pass. Stripe creates (or reuses)
 *   a Customer so the buyer can open the billing portal, and an invoice so the
 *   receipt shows up there. `option` is stamped on the session metadata; the
 *   webhook grants the pass only for metadata.option === 'sprint'.
 */
async function createCheckoutSession({ priceId, customerEmail, clientReferenceId, successUrl, cancelUrl, customerId, mode, option, idempotencyKey }) {
  const m = mode === 'payment' ? 'payment' : 'subscription';
  const params = {
    mode: m,
    'line_items': [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: clientReferenceId,      // our Supabase user id
    allow_promotion_codes: 'true',
  };
  if (customerId) params.customer = customerId;
  else if (customerEmail) params.customer_email = customerEmail;
  params.metadata = { user_id: clientReferenceId };
  if (option) params.metadata.option = option;
  if (m === 'subscription') {
    // Stamp the user id onto the subscription metadata so the webhook can map it.
    params['subscription_data'] = { metadata: { user_id: clientReferenceId } };
  } else {
    if (!customerId) params.customer_creation = 'always';
    params.invoice_creation = { enabled: 'true' };
    params.payment_intent_data = { metadata: { user_id: clientReferenceId, option: option || 'sprint' } };
  }
  return stripePost('/checkout/sessions', params, { idempotencyKey });
}

/**
 * The Checkout Session that created a PaymentIntent (refunds and disputes
 * carry only the payment_intent). null when none is found.
 */
async function findCheckoutSession(paymentIntentId) {
  if (!paymentIntentId) return null;
  const data = await stripeGet('/checkout/sessions?limit=1&payment_intent=' + encodeURIComponent(paymentIntentId));
  return (data && Array.isArray(data.data) && data.data[0]) || null;
}

/** Create a Billing Portal session so a user can manage/cancel. */
async function createPortalSession({ customerId, returnUrl }) {
  return stripePost('/billing_portal/sessions', { customer: customerId, return_url: returnUrl });
}

async function getSubscription(subId) { return stripeGet(`/subscriptions/${encodeURIComponent(subId)}`); }

/**
 * Verify a Stripe webhook signature (t=…,v1=… scheme). Returns the parsed event
 * object if valid, or null. `rawBody` MUST be the exact bytes Stripe sent.
 */
function verifyWebhook(rawBody, sigHeader, signingSecret) {
  if (!rawBody || !sigHeader || !signingSecret) return null;
  const parts = {};
  sigHeader.split(',').forEach((kv) => {
    const i = kv.indexOf('=');
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  });
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return null;
  const payload = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const expected = crypto
    .createHmac('sha256', signingSecret)
    .update(`${t}.${payload}`, 'utf8')
    .digest('hex');
  // Constant-time compare.
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(v1, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  // Optional replay window (5 min).
  const age = Math.abs(Date.now() / 1000 - Number(t));
  if (Number.isFinite(age) && age > 300) return null;
  try { return JSON.parse(payload); } catch (_) { return null; }
}

module.exports = {
  createCheckoutSession,
  createPortalSession,
  getSubscription,
  findCheckoutSession,
  verifyWebhook,
  apiVersion,
  stripePost,
  stripeGet,
};
