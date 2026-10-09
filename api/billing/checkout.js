/**
 * POST /api/billing/checkout  (Vercel serverless function)
 * ---------------------------------------------------------------------------
 * Creates a Stripe Checkout Session for the signed-in user to buy Pro, and
 * returns the hosted checkout URL. The user is taken to Stripe's hosted page —
 * no card data touches our servers (spec §17).
 *
 * Body: { app?: true, option?: 'job'|'pass30'|'pass90'|'pass365'|'mock10'|'monthly'|'annual' }
 *   Passes and the mock pack are ONE-TIME payments (payment mode, never
 *   renew), priced by env (api/_lib/passes.js) and granted by the webhook on
 *   checkout.session.completed. 'sprint' is the old name of pass30.
 *   monthly / annual are subscriptions, offered only if their env is set.
 *   Default when no option is sent: pass30.
 * An option whose env var is missing -> 400. No option configured -> 503.
 * GET (public) -> { options } so the signed-out Pricing page can show them.
 * A known Stripe customer (subscriptions mirror / earlier sprint) is reused so
 * one person keeps one customer and one billing portal.
 *
 * Identity comes from a verified Supabase JWT. The Supabase user id is stamped
 * as client_reference_id + subscription metadata so the webhook can map the
 * resulting subscription back to the user and grant entitlements.
 */

'use strict';

const { setCors, send } = require('../_lib/http');
const { getUser } = require('../_lib/supabaseAuth');
const { createCheckoutSession } = require('../_lib/stripe');
const billing = require('../_lib/billing');

const passes = require('../_lib/passes');

const OPTION_LABELS = {
  job: 'The Job pass', pass30: 'The 30-day pass', pass90: 'The 90-day pass', pass365: 'The 1-year pass',
  mock10: 'The mock interview pack', monthly: 'Monthly Pro', annual: 'Annual Pro',
  sprint: 'The 30-day pass', // old name of pass30, still accepted
};

/** One-time Checkout (no subscription): every pass and pack. */
function isOneTime(option) { return passes.isPass(option) || passes.isPack(option); }

function parseBody(body) {
  if (typeof body === 'string') { try { return JSON.parse(body); } catch (e) { return null; } }
  return body && typeof body === 'object' ? body : null;
}

// Where Stripe sends the user back. The product app
// (https://klnjoy.github.io/offerready-app/) sends { app: true } so users land
// back in the app; anything else keeps the original study-site pages.
function returnUrls(origin, body) {
  const base = String(origin || '').replace(/\/+$/, '');
  let b = body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (b && b.app === true) {
    const appPath = (process.env.APP_BASE_PATH || '/offerready-app').replace(/\/+$/, '');
    return {
      successUrl: base + appPath + '/jobs?upgraded=1',
      cancelUrl: base + appPath + '/account?canceled=1',
    };
  }
  return {
    successUrl: base + '/offerready/My-Jobs/index.html?upgraded=1',
    cancelUrl: base + '/offerready/assets/pricing.html?canceled=1',
  };
}

async function handler(req, res) {
  // /api/billing/portal is rewritten here (vercel.json) to stay within the
  // serverless function limit; it is a separate handler.
  if (isOp(req, 'portal')) return require('../_lib/handlers/billingPortal')(req, res);
  setCors(res, req.headers && req.headers.origin);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  // Public: which options this deployment sells (the signed-out Pricing page
  // has no /api/me/plan). No secrets: just ['monthly','annual','sprint'] subset.
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, max-age=300');
    send(res, 200, { options: billing.availableOptions() });
    return;
  }
  if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed.' }); return; }

  if (!process.env.STRIPE_SECRET_KEY || billing.availableOptions().length === 0) {
    send(res, 503, { error: 'Billing is not configured yet.' });
    return;
  }

  const body = parseBody(req.body) || {};
  let option = body.option === undefined || body.option === null || body.option === '' ? 'pass30' : String(body.option);
  if (option === 'sprint') option = 'pass30';
  if (!Object.prototype.hasOwnProperty.call(OPTION_LABELS, option)) {
    send(res, 400, { error: 'Unknown billing option.', options: billing.availableOptions() });
    return;
  }
  const priceId = billing.priceFor(option);
  if (!priceId) {
    send(res, 400, { error: `${OPTION_LABELS[option]} isn't available right now. Choose another option.`, options: billing.availableOptions() });
    return;
  }

  const user = await getUser(req);
  if (!user) { send(res, 401, { error: 'Sign in to upgrade.' }); return; }

  const origin = (req.headers && req.headers.origin) || (process.env.ALLOWED_ORIGIN || 'https://klnjoy.github.io');
  const urls = returnUrls(origin, req.body);

  // Reuse the Stripe customer we already know (best-effort; never blocks checkout).
  let state = null;
  try { state = await billing.getBillingState(user.id); } catch (_) { state = null; }
  const customerId = state ? state.customerId : null;
  // Already subscribed: a second subscription would double-bill. Plan changes
  // (monthly <-> annual) and cancellation live in the billing portal.
  if (!isOneTime(option) && state && state.proSource === 'subscription') {
    send(res, 409, { error: 'You already have a Pro subscription. Use Manage billing to switch or cancel it.', portal: !!customerId });
    return;
  }

  try {
    const session = await createCheckoutSession({
      priceId,
      mode: isOneTime(option) ? 'payment' : 'subscription',
      option,
      customerId: customerId || undefined,
      customerEmail: user.email || undefined,
      clientReferenceId: user.id,
      // A double-click or retry within the same minute gets the same session
      // back instead of a second one.
      idempotencyKey: 'checkout:' + user.id + ':' + option + ':' + Math.floor(Date.now() / 60000),
      successUrl: urls.successUrl,
      cancelUrl: urls.cancelUrl,
    });
    if (!session || !session.url) { send(res, 502, { error: 'Could not start checkout. Please try again.' }); return; }
    send(res, 200, { ok: true, url: session.url, option });
  } catch (err) {
    console.error('checkout error:', err && err.message);
    send(res, 502, { error: 'Could not start checkout. Please try again.' });
  }
}

function isOp(req, op) {
  const q = req && req.query && req.query.op;
  if (q === op) return true;
  return typeof (req && req.url) === 'string' && new RegExp('[?&]op=' + op + '(&|$)').test(req.url);
}

module.exports = handler;
module.exports.returnUrls = returnUrls;
