/**
 * POST /api/billing/checkout  (Vercel serverless function)
 * ---------------------------------------------------------------------------
 * Creates a Stripe Checkout Session (subscription mode) for the signed-in user
 * to upgrade to Pro, and returns the hosted checkout URL. The user is taken to
 * Stripe's hosted page — no card data touches our servers (spec §17).
 *
 * Identity comes from a verified Supabase JWT. The Supabase user id is stamped
 * as client_reference_id + subscription metadata so the webhook can map the
 * resulting subscription back to the user and grant entitlements.
 */

'use strict';

const { setCors, send } = require('../_lib/http');
const { getUser } = require('../_lib/supabaseAuth');
const { createCheckoutSession } = require('../_lib/stripe');

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
  setCors(res, req.headers && req.headers.origin);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed.' }); return; }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRO_MONTHLY_PRICE_ID) {
    send(res, 503, { error: 'Billing is not configured yet.' });
    return;
  }

  const user = await getUser(req);
  if (!user) { send(res, 401, { error: 'Sign in to upgrade.' }); return; }

  const origin = (req.headers && req.headers.origin) || (process.env.ALLOWED_ORIGIN || 'https://klnjoy.github.io');
  const urls = returnUrls(origin, req.body);

  try {
    const session = await createCheckoutSession({
      priceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
      customerEmail: user.email || undefined,
      clientReferenceId: user.id,
      successUrl: urls.successUrl,
      cancelUrl: urls.cancelUrl,
    });
    if (!session || !session.url) { send(res, 502, { error: 'Could not start checkout. Please try again.' }); return; }
    send(res, 200, { ok: true, url: session.url });
  } catch (err) {
    console.error('checkout error:', err && err.message);
    send(res, 502, { error: 'Could not start checkout. Please try again.' });
  }
}

module.exports = handler;
module.exports.returnUrls = returnUrls;
