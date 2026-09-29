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

const { setCors, send } = require('../lib/http');
const { getUser } = require('../lib/supabaseAuth');
const { createCheckoutSession } = require('../lib/stripe');

module.exports = async function handler(req, res) {
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
  const siteBase = origin.replace(/\/+$/, '') + '/offerready';

  try {
    const session = await createCheckoutSession({
      priceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
      customerEmail: user.email || undefined,
      clientReferenceId: user.id,
      successUrl: siteBase + '/My-Jobs/index.html?upgraded=1',
      cancelUrl: siteBase + '/assets/pricing.html?canceled=1',
    });
    if (!session || !session.url) { send(res, 502, { error: 'Could not start checkout. Please try again.' }); return; }
    send(res, 200, { ok: true, url: session.url });
  } catch (err) {
    console.error('checkout error:', err && err.message);
    send(res, 502, { error: 'Could not start checkout. Please try again.' });
  }
};
