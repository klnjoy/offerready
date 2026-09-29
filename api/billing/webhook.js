/**
 * POST /api/billing/webhook  (Vercel serverless function)
 * ---------------------------------------------------------------------------
 * Stripe subscription webhooks are the SOURCE OF TRUTH for Pro access (spec
 * §17/§18/§19). This handler:
 *   1. Reads the RAW body (bodyParser disabled) and verifies the signature.
 *   2. Deduplicates via webhook_events (idempotency ledger).
 *   3. Mirrors the subscription and grants/revokes the Pro entitlement bundle.
 *
 * Never trusts an unverified payload. Any failure fails closed (does not grant).
 * This endpoint is called by Stripe, not the browser — no CORS needed.
 */

'use strict';

const { verifyWebhook, getSubscription } = require('../lib/stripe');
const billing = require('../lib/billing');

// Vercel: give us the raw body so the Stripe signature can be verified.
module.exports.config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function accessUntilPeriodEnd() {
  return String(process.env.ACCESS_UNTIL_PERIOD_END || 'true').toLowerCase() !== 'false';
}

function isoOrNull(unixSeconds) {
  return unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;
}

async function applySubscriptionState(sub) {
  const userId = await billing.userIdFromSubscription(sub);
  if (!userId) { console.error('webhook: no user_id for subscription', sub && sub.id); return; }

  const status = sub.status;                       // active|trialing|past_due|canceled|...
  const periodEnd = isoOrNull(sub.current_period_end);
  const item = sub.items && sub.items.data && sub.items.data[0];
  const priceId = item && item.price && item.price.id;

  await billing.upsertSubscription({
    user_id: userId,
    stripe_customer_id: sub.customer,
    stripe_subscription_id: sub.id,
    stripe_price_id: priceId || null,
    plan: 'pro',
    status: status,
    current_period_start: isoOrNull(sub.current_period_start),
    current_period_end: periodEnd,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    canceled_at: isoOrNull(sub.canceled_at),
  });

  const grants = billing.ACTIVE_STATUSES.indexOf(status) !== -1;
  const keepUntilEnd = accessUntilPeriodEnd() && sub.cancel_at_period_end && periodEnd;

  if (grants) {
    // Active-ish: grant, expiring at period end so it lapses if not renewed.
    await billing.grantPro(userId, 'stripe:' + sub.id, periodEnd);
  } else if (status === 'canceled' && keepUntilEnd) {
    await billing.grantPro(userId, 'stripe:' + sub.id, periodEnd);
  } else {
    await billing.revokePro(userId);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed.' }); return; }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) { send(res, 503, { error: 'Webhook not configured.' }); return; }

  let raw;
  try { raw = await readRawBody(req); } catch (_) { send(res, 400, { error: 'No body.' }); return; }

  const sig = req.headers['stripe-signature'];
  const event = verifyWebhook(raw, sig, secret);
  if (!event) { send(res, 400, { error: 'Invalid signature.' }); return; }

  // Idempotency: only process each event once.
  const fresh = await billing.markEventOnce(event);
  if (!fresh) { send(res, 200, { received: true, duplicate: true }); return; }

  try {
    const obj = event.data && event.data.object;
    switch (event.type) {
      case 'checkout.session.completed': {
        // Fetch the subscription to get full state, then apply.
        if (obj && obj.subscription) {
          const sub = await getSubscription(obj.subscription);
          if (obj.metadata && obj.metadata.user_id && sub && !(sub.metadata && sub.metadata.user_id)) {
            sub.metadata = Object.assign({}, sub.metadata, { user_id: obj.metadata.user_id });
          }
          await applySubscriptionState(sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await applySubscriptionState(obj);
        break;
      }
      default:
        // Ignore unrelated events.
        break;
    }
    await billing.finishEvent(event.id, 'processed');
    send(res, 200, { received: true });
  } catch (err) {
    console.error('webhook processing error:', err && err.message);
    await billing.finishEvent(event.id, 'failed');
    // 200 so Stripe doesn't hammer retries forever on our internal error; the
    // event is marked failed for manual reconciliation.
    send(res, 200, { received: true, error: 'processing_failed' });
  }
};
