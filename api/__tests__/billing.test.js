/**
 * Tests for billing: checkout options (monthly / annual / sprint), the webhook's
 * one-time Sprint pass (grant, idempotency, extension), revoke keeping a
 * still-valid pass, the billing portal, /api/me/plan billing fields, story
 * coaching metering in /api/ask, and sign-in for job analysis in /api/ai.
 *
 * node --test, no deps. Supabase (PostgREST), Supabase Auth, Stripe and OpenAI
 * are faked through global.fetch with a tiny in-memory database.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { Readable } = require('stream');

const plans = require('../_lib/plans');
const rateLimit = require('../_lib/rateLimit');
const billing = require('../_lib/billing');
const { PRO_FEATURES, SPRINT_FEATURE } = billing;

const SB = 'https://proj.supabase.co';
const USER = '22222222-2222-2222-2222-222222222222';
const DAY = 24 * 60 * 60 * 1000;
const WHSEC = 'whsec_test_secret';

function resp(status, body, headers) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => (headers || {})[String(k).toLowerCase()] || null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** Parse "a=eq.x&b=in.(...)" into simple filters. */
function filtersOf(u) {
  const q = new URL(u).searchParams;
  const f = {};
  for (const [k, v] of q.entries()) {
    if (['select', 'order', 'limit', 'on_conflict', 'or'].includes(k)) continue;
    if (v.startsWith('eq.')) f[k] = (x) => String(x) === v.slice(3);
    else if (v.startsWith('in.(')) {
      const set = v.slice(4, -1).split(',').map((s) => s.replace(/^"|"$/g, ''));
      f[k] = (x) => set.includes(String(x));
    }
  }
  const or = q.get('or');
  if (or && or.includes('expires_at.is.null')) {
    const gt = /expires_at\.gt\.([^)]+)\)/.exec(or)[1];
    f.__exp = (row) => row.expires_at === null || Date.parse(row.expires_at) > Date.parse(gt);
  }
  return f;
}
function matches(row, f) {
  return Object.keys(f).every((k) => (k === '__exp' ? f[k](row) : f[k](row[k])));
}

/**
 * world: { entitlements: [], webhook_events: Map, subscriptions: [], usage: [] ,
 *          counts: {feature:n}, openai: 'ok'|'error'|'stream', stripe: {} }
 */
function stub(world) {
  const w = Object.assign({ entitlements: [], events: new Map(), subscriptions: [], usage: [], counts: {}, stripeCalls: [] }, world || {});
  const calls = [];
  const orig = global.fetch;
  global.fetch = async (url, opts) => {
    const u = String(url);
    const o = opts || {};
    const method = o.method || 'GET';
    calls.push({ url: u, method, body: o.body });
    if (u.startsWith(SB + '/auth/v1/user')) {
      const auth = (o.headers && o.headers.Authorization) || '';
      return auth === 'Bearer good-token' ? resp(200, { id: USER, email: 'a@b.c' }) : resp(401, {});
    }
    if (u.startsWith(SB + '/rest/v1/entitlements')) {
      if (w.entitlementsError) return resp(500, {});
      const f = filtersOf(u);
      if (method === 'GET') return resp(200, w.entitlements.filter((r) => matches(r, f)).map((r) => Object.assign({}, r)));
      if (method === 'POST') {
        for (const row of JSON.parse(o.body)) {
          const i = w.entitlements.findIndex((r) => r.user_id === row.user_id && r.feature === row.feature);
          if (i >= 0) w.entitlements[i] = Object.assign({}, w.entitlements[i], row);
          else w.entitlements.push(Object.assign({}, row));
        }
        return resp(201, null);
      }
      if (method === 'PATCH') {
        const patch = JSON.parse(o.body);
        w.entitlements.forEach((r, i) => { if (matches(r, f)) w.entitlements[i] = Object.assign({}, r, patch); });
        return resp(204, null);
      }
    }
    if (u.startsWith(SB + '/rest/v1/webhook_events')) {
      if (method === 'POST') {
        const row = JSON.parse(o.body);
        if (w.events.has(row.id)) return resp(409, { code: '23505' });
        w.events.set(row.id, row);
        return resp(201, null);
      }
      const id = new URL(u).searchParams.get('id').slice(3);
      if (method === 'PATCH') { if (w.events.has(id)) Object.assign(w.events.get(id), JSON.parse(o.body)); return resp(204, null); }
      if (method === 'DELETE') { w.events.delete(id); return resp(204, null); }
    }
    if (u.startsWith(SB + '/rest/v1/subscriptions')) {
      if (method === 'GET') return resp(200, w.subscriptions.filter((r) => matches(r, filtersOf(u))).slice(0, 1));
      if (method === 'POST') {
        const row = JSON.parse(o.body);
        const i = w.subscriptions.findIndex((r) => r.stripe_subscription_id === row.stripe_subscription_id);
        if (i >= 0) w.subscriptions[i] = Object.assign({}, w.subscriptions[i], row); else w.subscriptions.unshift(row);
        return resp(201, null);
      }
    }
    if (u.startsWith(SB + '/rest/v1/rpc/usage_counts')) {
      return resp(200, Object.keys(w.counts).map((f) => ({ feature: f, used: w.counts[f] })));
    }
    if (u.startsWith(SB + '/rest/v1/usage_events')) {
      w.usage.push(JSON.parse(o.body));
      return resp(201, null);
    }
    if (u.startsWith(SB + '/rest/v1/jobs')) return resp(200, [], { 'content-range': '*/0' });
    if (u.startsWith('https://api.stripe.com/v1/')) {
      const params = new URLSearchParams(o.body || '');
      w.stripeCalls.push({ path: u.slice('https://api.stripe.com/v1'.length), method, params });
      if (u.includes('/checkout/sessions')) return resp(200, { id: 'cs_new', url: 'https://checkout.stripe.com/c/pay/cs_new' });
      if (u.includes('/billing_portal/sessions')) {
        if (w.portalError) return resp(400, { error: { message: 'No configuration provided' } });
        return resp(200, { id: 'bps_1', url: 'https://billing.stripe.com/p/session/bps_1' });
      }
      if (u.includes('/subscriptions/')) return resp(200, w.stripeSub || {});
    }
    if (u.startsWith('https://api.openai.com/')) {
      if (w.openai === 'error') return resp(500, {});
      if (w.openai === 'stream') {
        const enc = new TextEncoder();
        const chunks = [
          'data: {"choices":[{"delta":{"content":"Tighten the result."}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"\\nFOLLOWUPS: a | b | c"}}]}\n\n',
          'data: [DONE]\n\n',
        ];
        let i = 0;
        return {
          ok: true, status: 200, headers: { get: () => 'text/event-stream' },
          body: { getReader: () => ({ read: async () => (i < chunks.length ? { value: enc.encode(chunks[i++]), done: false } : { done: true }), cancel: async () => {} }) },
        };
      }
      if (w.openai === 'json-analysis') {
        return resp(200, { model: 'gpt-test', choices: [{ message: { content: JSON.stringify({ roleSummary: 'Builds pipelines.', coreSkills: ['SQL'], technologies: ['dbt'] }) } }] });
      }
      return resp(200, { model: 'gpt-test', choices: [{ message: { content: 'Add a metric to the result.\nFOLLOWUPS: a | b | c' } }] });
    }
    throw new Error('unexpected fetch ' + method + ' ' + u);
  };
  return { w, calls, restore: () => { global.fetch = orig; } };
}

function fakeRes() {
  const res = { statusCode: 0, headers: {}, body: '', chunks: [] };
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
  res.write = (c) => { res.chunks.push(String(c)); return true; };
  res.end = (b) => { res.body = b || ''; res.writableEnded = true; return res; };
  res.json = () => JSON.parse(res.body);
  return res;
}

function req(method, body, token) {
  const headers = { origin: 'https://klnjoy.github.io', 'x-forwarded-for': '198.51.100.' + Math.floor(Math.random() * 250) };
  if (token) headers.authorization = 'Bearer ' + token;
  return { method, headers, body };
}

function webhookReq(event) {
  const raw = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', WHSEC).update(`${t}.${raw}`, 'utf8').digest('hex');
  const r = Readable.from([Buffer.from(raw)]);
  r.method = 'POST';
  r.headers = { 'stripe-signature': `t=${t},v1=${sig}` };
  return r;
}

function sprintEvent(id, sessionId, extra) {
  return {
    id, type: 'checkout.session.completed',
    data: { object: Object.assign({
      id: sessionId, object: 'checkout.session', mode: 'payment', payment_status: 'paid',
      customer: 'cus_sprint', client_reference_id: USER, metadata: { user_id: USER, option: 'sprint' },
    }, extra || {}) },
  };
}

const proRows = (w) => w.entitlements.filter((r) => PRO_FEATURES.includes(r.feature));
const marker = (w) => w.entitlements.find((r) => r.feature === SPRINT_FEATURE);

const ENV_KEYS = ['STRIPE_SECRET_KEY', 'STRIPE_PRO_MONTHLY_PRICE_ID', 'STRIPE_PRO_ANNUAL_PRICE_ID', 'STRIPE_SPRINT_PRICE_ID', 'STRIPE_WEBHOOK_SECRET', 'OPENAI_API_KEY'];

let errSpy;
test.beforeEach(() => {
  process.env.SUPABASE_URL = SB;
  process.env.SUPABASE_ANON_KEY = 'anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  for (const k of ENV_KEYS) delete process.env[k];
  plans._internal._reset();
  rateLimit._internal._reset();
  errSpy = [];
  test.mock.method(console, 'error', (...a) => { errSpy.push(a.join(' ')); });
});
test.afterEach(() => {
  test.mock.restoreAll();
  for (const k of ENV_KEYS) delete process.env[k];
});

function allPrices() {
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_PRO_MONTHLY_PRICE_ID = 'price_month';
  process.env.STRIPE_PRO_ANNUAL_PRICE_ID = 'price_year';
  process.env.STRIPE_SPRINT_PRICE_ID = 'price_sprint';
}

// ---- checkout options ------------------------------------------------------------

test('checkout: default option is monthly (subscription mode, monthly price)', async () => {
  allPrices();
  const handler = require('../billing/checkout');
  const s = stub();
  try {
    const res = fakeRes();
    await handler(req('POST', { app: true }, 'good-token'), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().url, 'https://checkout.stripe.com/c/pay/cs_new');
    const p = s.w.stripeCalls[0].params;
    assert.equal(p.get('mode'), 'subscription');
    assert.equal(p.get('line_items[0][price]'), 'price_month');
    assert.equal(p.get('subscription_data[metadata][user_id]'), USER);
    assert.equal(p.get('metadata[option]'), 'monthly');
    assert.equal(p.get('success_url'), 'https://klnjoy.github.io/offerready-app/jobs?upgraded=1');
  } finally { s.restore(); }
});

test('checkout: annual uses the annual price in subscription mode', async () => {
  allPrices();
  const handler = require('../billing/checkout');
  const s = stub();
  try {
    const res = fakeRes();
    await handler(req('POST', { app: true, option: 'annual' }, 'good-token'), res);
    assert.equal(res.statusCode, 200);
    const p = s.w.stripeCalls[0].params;
    assert.equal(p.get('mode'), 'subscription');
    assert.equal(p.get('line_items[0][price]'), 'price_year');
  } finally { s.restore(); }
});

test('checkout: sprint is a one-time payment (mode=payment, no subscription_data, customer created)', async () => {
  allPrices();
  const handler = require('../billing/checkout');
  const s = stub();
  try {
    const res = fakeRes();
    await handler(req('POST', JSON.stringify({ app: true, option: 'sprint' }), 'good-token'), res);
    assert.equal(res.statusCode, 200);
    const p = s.w.stripeCalls[0].params;
    assert.equal(p.get('mode'), 'payment');
    assert.equal(p.get('line_items[0][price]'), 'price_sprint');
    assert.equal(p.get('metadata[option]'), 'sprint');
    assert.equal(p.get('metadata[user_id]'), USER);
    assert.equal(p.get('customer_creation'), 'always');
    assert.equal(p.get('invoice_creation[enabled]'), 'true');
    assert.equal(p.get('customer_email'), 'a@b.c');
    assert.ok(![...p.keys()].some((k) => k.startsWith('subscription_data')));
  } finally { s.restore(); }
});

test('checkout: an option whose env var is missing -> 400 with a clear message (before any Stripe call)', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_PRO_MONTHLY_PRICE_ID = 'price_month';
  const handler = require('../billing/checkout');
  const s = stub();
  try {
    for (const [option, word] of [['annual', 'Annual'], ['sprint', 'Sprint']]) {
      const res = fakeRes();
      await handler(req('POST', { app: true, option }, 'good-token'), res);
      assert.equal(res.statusCode, 400, option);
      const b = res.json();
      assert.match(b.error, new RegExp(word));
      assert.match(b.error, /isn't available/);
      assert.deepEqual(b.options, ['monthly']);
    }
    const res = fakeRes();
    await handler(req('POST', { option: 'weekly' }, 'good-token'), res);
    assert.equal(res.statusCode, 400);
    assert.match(res.json().error, /Unknown billing option/);
    assert.equal(s.w.stripeCalls.length, 0);
  } finally { s.restore(); }
});

test('checkout: only the sprint configured -> sprint works, default monthly is 400', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_SPRINT_PRICE_ID = 'price_sprint';
  const handler = require('../billing/checkout');
  const s = stub();
  try {
    let res = fakeRes();
    await handler(req('POST', { app: true }, 'good-token'), res);
    assert.equal(res.statusCode, 400);
    res = fakeRes();
    await handler(req('POST', { app: true, option: 'sprint' }, 'good-token'), res);
    assert.equal(res.statusCode, 200);
  } finally { s.restore(); }
});

test('checkout: no secret key or no price at all -> 503; signed out -> 401', async () => {
  const handler = require('../billing/checkout');
  const s = stub();
  try {
    let res = fakeRes();
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID = 'price_month';
    await handler(req('POST', { app: true }, 'good-token'), res);
    assert.equal(res.statusCode, 503);
    delete process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    res = fakeRes();
    await handler(req('POST', { app: true }, 'good-token'), res);
    assert.equal(res.statusCode, 503);
    allPrices();
    res = fakeRes();
    await handler(req('POST', { app: true, option: 'sprint' }), res);
    assert.equal(res.statusCode, 401);
  } finally { s.restore(); }
});

test('checkout: reuses a known Stripe customer; an active subscriber is sent to the portal (409)', async () => {
  allPrices();
  const handler = require('../billing/checkout');
  const future = new Date(Date.now() + 10 * DAY).toISOString();
  const s = stub({ subscriptions: [{ user_id: USER, stripe_customer_id: 'cus_known', stripe_subscription_id: 'sub_1', status: 'canceled', current_period_end: future }] });
  try {
    let res = fakeRes();
    await handler(req('POST', { app: true, option: 'sprint' }, 'good-token'), res);
    assert.equal(res.statusCode, 200);
    const p = s.w.stripeCalls[0].params;
    assert.equal(p.get('customer'), 'cus_known');
    assert.equal(p.get('customer_email'), null);
    assert.equal(p.get('customer_creation'), null, 'customer_creation is not allowed with customer');

    s.w.subscriptions[0].status = 'active';
    res = fakeRes();
    await handler(req('POST', { app: true, option: 'annual' }, 'good-token'), res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().portal, true);
    assert.equal(s.w.stripeCalls.length, 1);
  } finally { s.restore(); }
});

test('checkout GET: public list of configured options', async () => {
  const handler = require('../billing/checkout');
  let res = fakeRes();
  await handler(req('GET'), res);
  assert.deepEqual(res.json(), { options: [] });
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_PRO_ANNUAL_PRICE_ID = 'price_year';
  process.env.STRIPE_SPRINT_PRICE_ID = 'price_sprint';
  res = fakeRes();
  await handler(req('GET'), res);
  assert.deepEqual(res.json(), { options: ['annual', 'sprint'] });
});

// ---- webhook: sprint pass ----------------------------------------------------------

test('webhook sprint: a paid one-time session grants the Pro bundle + marker for 30 days', async () => {
  process.env.STRIPE_WEBHOOK_SECRET = WHSEC;
  const handler = require('../billing/webhook');
  const s = stub();
  try {
    const t0 = Date.now();
    const res = fakeRes();
    await handler(webhookReq(sprintEvent('evt_1', 'cs_1')), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { received: true });
    const m = marker(s.w);
    assert.ok(m, 'marker row');
    assert.equal(m.status, 'active');
    assert.equal(m.source, 'sprint:cs_1|cus_sprint');
    const exp = Date.parse(m.expires_at);
    assert.ok(Math.abs(exp - (t0 + 30 * DAY)) < 5000, '30 days from now');
    const pro = proRows(s.w);
    assert.equal(pro.length, PRO_FEATURES.length);
    for (const r of pro) { assert.equal(r.status, 'active'); assert.equal(r.expires_at, m.expires_at); assert.equal(r.source, m.source); }
    assert.equal(s.w.events.get('evt_1').status, 'processed');
    assert.ok(s.w.events.has('checkout:cs_1'), 'session ledger key');
    // The plan reads as Pro.
    plans._internal._reset();
    assert.equal(await plans.getPlan(USER), 'pro');
  } finally { s.restore(); }
});

test('webhook sprint: idempotent on the session id (same event twice, and a second event for the same session)', async () => {
  process.env.STRIPE_WEBHOOK_SECRET = WHSEC;
  const handler = require('../billing/webhook');
  const s = stub();
  try {
    await handler(webhookReq(sprintEvent('evt_1', 'cs_1')), fakeRes());
    const first = marker(s.w).expires_at;
    const dup = fakeRes();
    await handler(webhookReq(sprintEvent('evt_1', 'cs_1')), dup);
    assert.equal(JSON.parse(dup.body).duplicate, true);
    // A different event for the same session (async_payment_succeeded).
    const ev = sprintEvent('evt_2', 'cs_1');
    ev.type = 'checkout.session.async_payment_succeeded';
    const r2 = fakeRes();
    await handler(webhookReq(ev), r2);
    assert.equal(r2.statusCode, 200);
    assert.equal(marker(s.w).expires_at, first, 'not extended twice');
  } finally { s.restore(); }
});

test('webhook sprint: buying again before it ends extends from the current expiry', async () => {
  process.env.STRIPE_WEBHOOK_SECRET = WHSEC;
  const handler = require('../billing/webhook');
  const s = stub();
  try {
    await handler(webhookReq(sprintEvent('evt_1', 'cs_1')), fakeRes());
    const first = Date.parse(marker(s.w).expires_at);
    await handler(webhookReq(sprintEvent('evt_2', 'cs_2')), fakeRes());
    const second = Date.parse(marker(s.w).expires_at);
    assert.equal(second - first, 30 * DAY);
    assert.equal(marker(s.w).source, 'sprint:cs_2|cus_sprint');
    for (const r of proRows(s.w)) assert.equal(Date.parse(r.expires_at), second);
  } finally { s.restore(); }
});

test('webhook sprint: an expired pass restarts from now, not from the old expiry', async () => {
  process.env.STRIPE_WEBHOOK_SECRET = WHSEC;
  const handler = require('../billing/webhook');
  const old = new Date(Date.now() - 5 * DAY).toISOString();
  const s = stub({ entitlements: [{ user_id: USER, feature: SPRINT_FEATURE, status: 'active', expires_at: old, source: 'sprint:cs_0' }] });
  try {
    const t0 = Date.now();
    await handler(webhookReq(sprintEvent('evt_1', 'cs_1')), fakeRes());
    assert.ok(Math.abs(Date.parse(marker(s.w).expires_at) - (t0 + 30 * DAY)) < 5000);
  } finally { s.restore(); }
});

test('webhook sprint: unpaid (async pending) or non-sprint payment sessions grant nothing', async () => {
  process.env.STRIPE_WEBHOOK_SECRET = WHSEC;
  const handler = require('../billing/webhook');
  const s = stub();
  try {
    await handler(webhookReq(sprintEvent('evt_1', 'cs_1', { payment_status: 'unpaid' })), fakeRes());
    await handler(webhookReq(sprintEvent('evt_2', 'cs_2', { metadata: { user_id: USER } })), fakeRes());
    assert.equal(s.w.entitlements.length, 0);
    assert.ok(!s.w.events.has('checkout:cs_1'), 'pending session is not claimed, so the async success can grant');
    const ev = sprintEvent('evt_3', 'cs_1');
    ev.type = 'checkout.session.async_payment_succeeded';
    await handler(webhookReq(ev), fakeRes());
    assert.ok(marker(s.w));
  } finally { s.restore(); }
});

test('webhook sprint: a storage failure releases the session claim so a resend can grant', async () => {
  process.env.STRIPE_WEBHOOK_SECRET = WHSEC;
  const handler = require('../billing/webhook');
  const s = stub({ entitlementsError: true });
  try {
    const res = fakeRes();
    await handler(webhookReq(sprintEvent('evt_1', 'cs_1')), res);
    assert.equal(JSON.parse(res.body).error, 'processing_failed');
    assert.ok(!s.w.events.has('checkout:cs_1'));
    s.w.entitlementsError = false;
    await handler(webhookReq(sprintEvent('evt_1b', 'cs_1')), fakeRes());
    assert.ok(marker(s.w));
  } finally { s.restore(); }
});

test('webhook sprint: an active subscription that lasts longer keeps its Pro rows', async () => {
  process.env.STRIPE_WEBHOOK_SECRET = WHSEC;
  const handler = require('../billing/webhook');
  const subEnd = new Date(Date.now() + 300 * DAY).toISOString();
  const s = stub({ entitlements: PRO_FEATURES.map((f) => ({ user_id: USER, feature: f, status: 'active', expires_at: subEnd, source: 'stripe:sub_1' })) });
  try {
    await handler(webhookReq(sprintEvent('evt_1', 'cs_1')), fakeRes());
    for (const r of proRows(s.w)) { assert.equal(r.expires_at, subEnd); assert.equal(r.source, 'stripe:sub_1'); }
    assert.ok(marker(s.w));
  } finally { s.restore(); }
});

// ---- revoke keeps a still-valid sprint ---------------------------------------------

function subEvent(id, status, extra) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id, type: 'customer.subscription.deleted',
    data: { object: Object.assign({
      id: 'sub_1', customer: 'cus_sub', status, metadata: { user_id: USER },
      current_period_start: now - 20 * 86400, current_period_end: now - 60, cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_month' } }] },
    }, extra || {}) },
  };
}

test('revoke: canceled subscription with a still-valid sprint keeps Pro until the sprint ends', async () => {
  process.env.STRIPE_WEBHOOK_SECRET = WHSEC;
  const handler = require('../billing/webhook');
  const sprintEnd = new Date(Date.now() + 12 * DAY).toISOString();
  const subEnd = new Date(Date.now() + 20 * DAY).toISOString();
  const s = stub({
    entitlements: PRO_FEATURES.map((f) => ({ user_id: USER, feature: f, status: 'active', expires_at: subEnd, source: 'stripe:sub_1' }))
      .concat([{ user_id: USER, feature: SPRINT_FEATURE, status: 'active', expires_at: sprintEnd, source: 'sprint:cs_9|cus_sub' }]),
  });
  try {
    const res = fakeRes();
    await handler(webhookReq(subEvent('evt_del', 'canceled')), res);
    assert.equal(res.statusCode, 200);
    for (const r of proRows(s.w)) {
      assert.equal(r.status, 'active');
      assert.equal(r.expires_at, sprintEnd);
      assert.equal(r.source, 'sprint:cs_9|cus_sub');
    }
    plans._internal._reset();
    assert.equal(await plans.getPlan(USER), 'pro');
  } finally { s.restore(); }
});

test('revoke: without a sprint (or with an expired one) the Pro bundle is revoked', async () => {
  for (const sprint of [null, new Date(Date.now() - DAY).toISOString()]) {
    process.env.STRIPE_WEBHOOK_SECRET = WHSEC;
    const handler = require('../billing/webhook');
    const ents = PRO_FEATURES.map((f) => ({ user_id: USER, feature: f, status: 'active', expires_at: null, source: 'stripe:sub_1' }));
    if (sprint) ents.push({ user_id: USER, feature: SPRINT_FEATURE, status: 'active', expires_at: sprint, source: 'sprint:cs_old' });
    const s = stub({ entitlements: ents });
    try {
      await handler(webhookReq(subEvent('evt_del_' + (sprint ? 'x' : 'y'), 'canceled')), fakeRes());
      for (const r of proRows(s.w)) assert.equal(r.status, 'revoked');
    } finally { s.restore(); }
  }
});

test('grant: a subscription renewal never shortens a longer sprint pass', async () => {
  const sprintEnd = new Date(Date.now() + 25 * DAY).toISOString();
  const periodEnd = new Date(Date.now() + 5 * DAY).toISOString();
  const s = stub({ entitlements: [{ user_id: USER, feature: SPRINT_FEATURE, status: 'active', expires_at: sprintEnd, source: 'sprint:cs_1' }] });
  try {
    await billing.grantPro(USER, 'stripe:sub_1', periodEnd);
    for (const r of proRows(s.w)) { assert.equal(r.expires_at, sprintEnd); assert.equal(r.source, 'stripe:sub_1'); }
    const later = new Date(Date.now() + 40 * DAY).toISOString();
    await billing.grantPro(USER, 'stripe:sub_1', later);
    for (const r of proRows(s.w)) assert.equal(r.expires_at, later);
  } finally { s.restore(); }
});

test('webhook: subscription period end falls back to the item (Stripe API 2025-03-31+)', async () => {
  process.env.STRIPE_WEBHOOK_SECRET = WHSEC;
  const handler = require('../billing/webhook');
  const s = stub();
  try {
    const end = Math.floor(Date.now() / 1000) + 30 * 86400;
    const ev = subEvent('evt_upd', 'active', { current_period_end: undefined, current_period_start: undefined, items: { data: [{ price: { id: 'price_year' }, current_period_end: end, current_period_start: end - 86400 }] } });
    ev.type = 'customer.subscription.updated';
    await handler(webhookReq(ev), fakeRes());
    assert.equal(s.w.subscriptions[0].current_period_end, new Date(end * 1000).toISOString());
    for (const r of proRows(s.w)) assert.equal(r.expires_at, new Date(end * 1000).toISOString());
  } finally { s.restore(); }
});

test('webhook: config disables the body parser (raw body for signatures)', () => {
  const handler = require('../billing/webhook');
  assert.deepEqual(handler.config, { api: { bodyParser: false } });
});

// ---- portal --------------------------------------------------------------------------

test('portal: 503 without Stripe config', async () => {
  const handler = require('../billing/portal');
  const s = stub();
  try {
    const res = fakeRes();
    await handler(req('POST', {}, 'good-token'), res);
    assert.equal(res.statusCode, 503);
  } finally { s.restore(); }
});

test('portal: 401 signed out; 404 with no customer yet', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  const handler = require('../billing/portal');
  const s = stub();
  try {
    let res = fakeRes();
    await handler(req('POST', {}), res);
    assert.equal(res.statusCode, 401);
    res = fakeRes();
    await handler(req('POST', {}, 'good-token'), res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json(), { error: 'No billing account yet.' });
    assert.equal(s.w.stripeCalls.length, 0);
  } finally { s.restore(); }
});

test('portal: creates a session for the mirrored customer with return_url /account', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  const handler = require('../billing/portal');
  const s = stub({ subscriptions: [{ user_id: USER, stripe_customer_id: 'cus_123', stripe_subscription_id: 'sub_1', status: 'active' }] });
  try {
    const res = fakeRes();
    await handler(req('POST', {}, 'good-token'), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().url, 'https://billing.stripe.com/p/session/bps_1');
    const c = s.w.stripeCalls[0];
    assert.equal(c.path, '/billing_portal/sessions');
    assert.equal(c.params.get('customer'), 'cus_123');
    assert.equal(c.params.get('return_url'), 'https://klnjoy.github.io/offerready-app/account');
  } finally { s.restore(); }
});

test('portal: a sprint-only buyer uses the customer remembered on the pass; Stripe error -> 502', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  const handler = require('../billing/portal');
  const end = new Date(Date.now() + 9 * DAY).toISOString();
  const s = stub({ entitlements: [{ user_id: USER, feature: SPRINT_FEATURE, status: 'active', expires_at: end, source: 'sprint:cs_1|cus_sprint' }] });
  try {
    let res = fakeRes();
    await handler(req('POST', {}, 'good-token'), res);
    assert.equal(res.statusCode, 200);
    assert.equal(s.w.stripeCalls[0].params.get('customer'), 'cus_sprint');
    s.w.portalError = true;
    res = fakeRes();
    await handler(req('POST', {}, 'good-token'), res);
    assert.equal(res.statusCode, 502);
  } finally { s.restore(); }
});

// ---- /api/me/plan billing block ---------------------------------------------------------

test('me/plan: billing block lists only configured options; existing fields unchanged', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_PRO_MONTHLY_PRICE_ID = 'price_month';
  process.env.STRIPE_SPRINT_PRICE_ID = 'price_sprint';
  const handler = require('../me/plan');
  const s = stub();
  try {
    const res = fakeRes();
    await handler(req('GET', undefined, 'good-token'), res);
    assert.equal(res.statusCode, 200);
    const b = res.json();
    for (const k of ['plan', 'usage', 'usage_known', 'limits', 'period_start', 'period_end', 'plan_known']) assert.ok(k in b, k);
    assert.deepEqual(b.billing, { options: ['monthly', 'sprint'], portal: false, pro_source: null, pro_expires_at: null, pro_interval: null, cancel_at_period_end: false });
  } finally { s.restore(); }
});

test('me/plan: subscription source (annual) and sprint source', async () => {
  allPrices();
  const handler = require('../me/plan');
  const end = new Date(Date.now() + 200 * DAY).toISOString();
  let s = stub({
    subscriptions: [{ user_id: USER, stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1', stripe_price_id: 'price_year', status: 'active', current_period_end: end, cancel_at_period_end: true }],
    entitlements: PRO_FEATURES.map((f) => ({ user_id: USER, feature: f, status: 'active', expires_at: end, source: 'stripe:sub_1' })),
  });
  try {
    const res = fakeRes();
    await handler(req('GET', undefined, 'good-token'), res);
    const b = res.json();
    assert.equal(b.plan, 'pro');
    assert.deepEqual(b.billing, { options: ['monthly', 'annual', 'sprint'], portal: true, pro_source: 'subscription', pro_expires_at: end, pro_interval: 'year', cancel_at_period_end: true });
  } finally { s.restore(); }
  plans._internal._reset();
  const sEnd = new Date(Date.now() + 22 * DAY).toISOString();
  s = stub({
    entitlements: PRO_FEATURES.map((f) => ({ user_id: USER, feature: f, status: 'active', expires_at: sEnd, source: 'sprint:cs_1' }))
      .concat([{ user_id: USER, feature: SPRINT_FEATURE, status: 'active', expires_at: sEnd, source: 'sprint:cs_1' }]),
  });
  try {
    const res = fakeRes();
    await handler(req('GET', undefined, 'good-token'), res);
    const b = res.json();
    assert.equal(b.billing.pro_source, 'sprint');
    assert.equal(b.billing.pro_expires_at, sEnd);
    assert.equal(b.billing.portal, false, 'no customer recorded on this pass');
  } finally { s.restore(); }
});

test('me/plan: billing storage errors never fail the endpoint', async () => {
  allPrices();
  const handler = require('../me/plan');
  const s = stub({ entitlementsError: true });
  try {
    const res = fakeRes();
    await handler(req('GET', undefined, 'good-token'), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().billing.pro_source, null);
  } finally { s.restore(); }
});

// ---- story coaching metering (/api/ask purpose:'story_coach') --------------------------

const coachBody = (extra) => Object.assign({ question: 'Coach this STAR story: I migrated our pipelines...', purpose: 'story_coach' }, extra || {});

test('ask story_coach: 401 without a valid token (no OpenAI call)', async () => {
  process.env.OPENAI_API_KEY = 'k';
  const handler = require('../ask');
  const s = stub();
  try {
    for (const token of [undefined, 'bad-token']) {
      const res = fakeRes();
      await handler(req('POST', coachBody(), token), res);
      assert.equal(res.statusCode, 401);
      assert.equal(res.json().signin, true);
    }
    assert.ok(!s.calls.some((c) => c.url.includes('openai')));
  } finally { s.restore(); }
});

test('ask story_coach: Free over the story_ai limit -> 403 quotaError shape', async () => {
  process.env.OPENAI_API_KEY = 'k';
  const handler = require('../ask');
  const s = stub({ counts: { story_ai: 3 } });
  try {
    const res = fakeRes();
    await handler(req('POST', coachBody({ stream: true }), 'good-token'), res);
    assert.equal(res.statusCode, 403);
    const b = res.json();
    assert.deepEqual([b.upgrade, b.feature, b.used, b.limit, b.plan], [true, 'story_ai', 3, 3, 'free']);
    assert.ok(b.error && b.resets_at);
    assert.ok(!s.calls.some((c) => c.url.includes('openai')));
    assert.equal(s.w.usage.length, 0);
  } finally { s.restore(); }
});

test('ask story_coach: records one story_ai use after a successful answer (JSON and stream)', async () => {
  process.env.OPENAI_API_KEY = 'k';
  const handler = require('../ask');
  let s = stub({ counts: { story_ai: 1 } });
  try {
    const res = fakeRes();
    await handler(req('POST', coachBody(), 'good-token'), res);
    assert.equal(res.statusCode, 200);
    assert.match(res.json().answer, /metric/);
    assert.deepEqual(s.w.usage, [{ user_id: USER, feature: 'story_ai' }]);
  } finally { s.restore(); }
  plans._internal._reset();
  s = stub({ counts: { story_ai: 1 }, openai: 'stream' });
  try {
    const res = fakeRes();
    await handler(req('POST', coachBody({ stream: true }), 'good-token'), res);
    const out = res.chunks.join('');
    assert.match(out, /event: done/);
    assert.deepEqual(s.w.usage, [{ user_id: USER, feature: 'story_ai' }]);
  } finally { s.restore(); }
});

test('ask story_coach: a failed answer is not recorded', async () => {
  process.env.OPENAI_API_KEY = 'k';
  const handler = require('../ask');
  const s = stub({ openai: 'error' });
  try {
    const res = fakeRes();
    await handler(req('POST', coachBody(), 'good-token'), res);
    assert.equal(res.statusCode, 502);
    assert.equal(s.w.usage.length, 0);
  } finally { s.restore(); }
});

test('ask help assistant (no purpose): still anonymous and unmetered; CORS allows Authorization', async () => {
  process.env.OPENAI_API_KEY = 'k';
  const handler = require('../ask');
  const s = stub();
  try {
    const res = fakeRes();
    await handler(req('POST', { question: 'What is RAG?' }), res);
    assert.equal(res.statusCode, 200);
    assert.ok(!s.calls.some((c) => c.url.startsWith(SB)), 'no Supabase calls');
    assert.match(res.headers['Access-Control-Allow-Headers'], /Authorization/);
  } finally { s.restore(); }
});

// ---- analyze requires sign-in (/api/ai analyze_jd) ------------------------------------

const JD = 'We are hiring a senior data engineer to build pipelines with Snowflake and dbt. '.repeat(3);

test('ai analyze_jd: without a valid user -> 401 {signin:true}, no OpenAI call', async () => {
  process.env.OPENAI_API_KEY = 'k';
  const handler = require('../ai');
  const s = stub();
  try {
    for (const token of [undefined, 'bad-token']) {
      const res = fakeRes();
      await handler(req('POST', { action: 'analyze_jd', jobDescription: JD }, token), res);
      assert.equal(res.statusCode, 401);
      assert.deepEqual(res.json(), { error: 'Sign in to analyze a job. It\'s free.', signin: true });
    }
    assert.ok(!s.calls.some((c) => c.url.includes('openai')));
  } finally { s.restore(); }
});

test('ai analyze_jd: signed in -> analysis + one analyses use recorded', async () => {
  process.env.OPENAI_API_KEY = 'k';
  const handler = require('../ai');
  const s = stub({ openai: 'json-analysis' });
  try {
    const res = fakeRes();
    await handler(req('POST', { action: 'analyze_jd', jobDescription: JD }, 'good-token'), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().analysis.roleSummary, 'Builds pipelines.');
    assert.deepEqual(s.w.usage, [{ user_id: USER, feature: 'analyses' }]);
  } finally { s.restore(); }
});

test('ai: other actions keep their behavior (gap_analysis 401 message unchanged, unknown action 400)', async () => {
  process.env.OPENAI_API_KEY = 'k';
  const handler = require('../ai');
  const s = stub();
  try {
    let res = fakeRes();
    await handler(req('POST', { action: 'gap_analysis', jobDescription: JD }), res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error, 'Sign in to use this feature.');
    res = fakeRes();
    await handler(req('POST', { action: 'nope' }), res);
    assert.equal(res.statusCode, 400);
  } finally { s.restore(); }
});
