// Admin accounts (ADMIN_EMAILS) always resolve to Pro, with no Stripe row and
// no database lookup; everyone else is unchanged.
const test = require('node:test');
const assert = require('node:assert');

const auth = require('../_lib/supabaseAuth');
const plans = require('../_lib/plans');

test('an ADMIN_EMAILS account is Pro; others are not', async () => {
  const saved = { a: process.env.ADMIN_EMAILS, u: process.env.SUPABASE_URL };
  process.env.ADMIN_EMAILS = ' Owner@Example.com , team@example.com';
  delete process.env.SUPABASE_URL; // no database: a non-admin reads as free
  try {
    plans._internal._reset();
    auth.rememberEmail('u-admin', 'owner@example.com');
    auth.rememberEmail('u-other', 'someone@example.com');
    const a = await plans._internal.resolvePlan('u-admin');
    assert.strictEqual(a.plan, 'pro');
    assert.strictEqual(a.known, true);
    assert.strictEqual(a.pass, null);
    assert.strictEqual(await plans.getPlan('u-admin'), 'pro');
    assert.strictEqual((await plans._internal.resolvePlan('u-other')).plan, 'free');
    // An unknown email (not seen this instance) is not treated as admin.
    assert.strictEqual(plans._internal.isAdminUser('u-unseen'), false);
  } finally {
    if (saved.a === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = saved.a;
    if (saved.u !== undefined) process.env.SUPABASE_URL = saved.u;
    plans._internal._reset();
  }
});

test('with ADMIN_EMAILS unset nobody is an admin', () => {
  const saved = process.env.ADMIN_EMAILS;
  delete process.env.ADMIN_EMAILS;
  try {
    auth.rememberEmail('u-admin2', 'owner@example.com');
    assert.strictEqual(plans._internal.isAdminUser('u-admin2'), false);
  } finally { if (saved !== undefined) process.env.ADMIN_EMAILS = saved; }
});
