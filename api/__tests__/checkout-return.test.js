/**
 * Tests for returnUrls (api/billing/checkout.js): Stripe returns users to the
 * product app when it asks ({ app: true }), and to the study site otherwise.
 * Uses Node's built-in test runner (node --test) — no external dependencies.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { returnUrls } = require('../billing/checkout');

test('returnUrls: app requests return to the product app', () => {
  const u = returnUrls('https://klnjoy.github.io', { app: true });
  assert.equal(u.successUrl, 'https://klnjoy.github.io/offerready-app/jobs?upgraded=1');
  assert.equal(u.cancelUrl, 'https://klnjoy.github.io/offerready-app/pricing?canceled=1');
});

test('returnUrls: the custom domain serves the app at the root', () => {
  const u = returnUrls('https://getofferready.app', { app: true });
  assert.equal(u.successUrl, 'https://getofferready.app/jobs?upgraded=1');
  assert.equal(u.cancelUrl, 'https://getofferready.app/pricing?canceled=1');
});

test('appBasePath: GitHub Pages keeps /offerready-app, other hosts use the root', () => {
  const { appBasePath } = require('../_lib/http');
  assert.equal(appBasePath('https://klnjoy.github.io'), '/offerready-app');
  assert.equal(appBasePath('https://getofferready.app'), '');
  assert.equal(appBasePath('https://www.getofferready.app/'), '');
  assert.equal(appBasePath(''), '');
});

test('returnUrls: a JSON string body is parsed', () => {
  const u = returnUrls('https://klnjoy.github.io/', '{"app":true}');
  assert.equal(u.successUrl, 'https://klnjoy.github.io/offerready-app/jobs?upgraded=1');
});

test('returnUrls: no flag keeps the original study-site pages', () => {
  for (const body of [undefined, null, {}, { app: 'yes' }, 'not json']) {
    const u = returnUrls('https://klnjoy.github.io', body);
    assert.equal(u.successUrl, 'https://klnjoy.github.io/offerready/My-Jobs/index.html?upgraded=1');
    assert.equal(u.cancelUrl, 'https://klnjoy.github.io/offerready/assets/pricing.html?canceled=1');
  }
});
