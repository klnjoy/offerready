/**
 * POST /api/billing/portal  (Vercel serverless function)
 * ---------------------------------------------------------------------------
 * Opens the Stripe Billing Portal for the signed-in user so they can update
 * their card, switch monthly <-> annual, see invoices or cancel. Returns
 * { url } of a short-lived portal session; the app redirects to it, and
 * Stripe sends the user back to the app's /account.
 *
 * The Stripe customer id comes from the subscriptions mirror (written by the
 * webhook); a sprint-only buyer's customer is remembered on their pass.
 *
 *   401  not signed in
 *   404  { error: 'No billing account yet.' }  (never bought anything)
 *   503  Stripe (or the Supabase service key) isn't configured
 *   502  Stripe refused (e.g. the portal isn't configured in the dashboard)
 */

'use strict';

const { setCors, send } = require('../http');
const { getUser } = require('../supabaseAuth');
const { createPortalSession } = require('../stripe');
const billing = require('../billing');

function returnUrl(origin) {
  const base = String(origin || '').replace(/\/+$/, '');
  const appPath = (process.env.APP_BASE_PATH || '/offerready-app').replace(/\/+$/, '');
  return base + appPath + '/account';
}

async function handler(req, res) {
  setCors(res, req.headers && req.headers.origin);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed.' }); return; }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    send(res, 503, { error: 'Billing is not configured yet.' });
    return;
  }

  const user = await getUser(req);
  if (!user) { send(res, 401, { error: 'Sign in to manage billing.' }); return; }

  const state = await billing.getBillingState(user.id);
  if (!state.customerId) { send(res, 404, { error: 'No billing account yet.' }); return; }

  const origin = (req.headers && req.headers.origin) || (process.env.ALLOWED_ORIGIN || 'https://klnjoy.github.io');
  try {
    const session = await createPortalSession({ customerId: state.customerId, returnUrl: returnUrl(origin) });
    if (!session || !session.url) { send(res, 502, { error: 'Could not open billing. Please try again.' }); return; }
    send(res, 200, { ok: true, url: session.url });
  } catch (err) {
    console.error('portal error:', err && err.message);
    send(res, 502, { error: 'Could not open billing. Please try again.' });
  }
}

module.exports = handler;
module.exports.returnUrl = returnUrl;
