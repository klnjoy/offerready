/**
 * Admin dashboard extras: GET /api/me/plan?op=geo (coarse location from
 * Vercel headers, no sign-in) and plans/geo in op=metrics (migration 0022,
 * optional until applied). node --test, global fetch stubbed.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

function json(status, body) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
}

function withEnv(env, fn) {
  const saved = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; if (env[k] == null) delete process.env[k]; else process.env[k] = env[k]; }
  const restore = () => { for (const k of Object.keys(saved)) { if (saved[k] == null) delete process.env[k]; else process.env[k] = saved[k]; } };
  return Promise.resolve().then(fn).finally(restore);
}

const realFetch = global.fetch;
test.afterEach(() => { global.fetch = realFetch; });

function mockRes() {
  let out = null;
  return {
    statusCode: 200, headers: {},
    status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k] = v; },
    end(b) { if (b) out = JSON.parse(b); }, json(b) { out = b; return this; }, send(b) { out = typeof b === 'string' ? JSON.parse(b) : b; return this; },
    get out() { return out; },
  };
}

test('op=geo returns only a country and region, cleaned, without sign-in', async () => {
  const plan = require('../me/plan');
  global.fetch = async () => { throw new Error('no network needed'); };
  let res = mockRes();
  await plan({ method: 'GET', headers: { 'x-vercel-ip-country': 'US', 'x-vercel-ip-country-region': 'ks', 'x-vercel-ip-city': 'Wichita', 'x-forwarded-for': '1.2.3.4' }, query: { op: 'geo' } }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.out, { country: 'US', region: 'KS' });
  res = mockRes();
  await plan({ method: 'GET', headers: { 'x-vercel-ip-country': '<script>', 'x-vercel-ip-country-region': 'toolongvalue' }, query: { op: 'geo' } }, res);
  assert.deepStrictEqual(res.out, { country: '', region: '' });
});

test('op=metrics includes plans and geo when migration 0022 is applied, null when not', async () => {
  const plan = require('../me/plan');
  const extra = { plans: [{ plan: 'free', users: 10, with_credits: 0 }, { plan: 'trial', users: 3, with_credits: 0 }], geo: [{ country: 'US', region: 'KS', people: 4, visitors: 3 }] };
  let missing = false;
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return json(200, { id: 'u1', email: 'boss@example.com' });
    if (u.includes('/rpc/admin_metrics')) return json(200, { people: 1, events: [] });
    if (u.includes('/rpc/admin_plans_geo')) return missing ? json(404, { code: 'PGRST202' }) : json(200, extra);
    return json(200, []);
  };
  await withEnv({ SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', ADMIN_EMAILS: 'boss@example.com' }, async () => {
    let res = mockRes();
    await plan({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: { op: 'metrics', days: '30' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.out.plans, extra.plans);
    assert.deepStrictEqual(res.out.geo, extra.geo);
    missing = true;
    res = mockRes();
    await plan({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: { op: 'metrics', days: '30' } }, res);
    assert.strictEqual(res.statusCode, 200, 'the dashboard still loads before 0022 is applied');
    assert.strictEqual(res.out.plans, null);
    assert.strictEqual(res.out.geo, null);
  });
});

test('op=metrics includes the funnel when migration 0025 is applied, null when not', async () => {
  const plan = require('../me/plan');
  const f = { visited: 9, opened_add: 4, submitted: 3, asked_sign_in: 3, signed_in: 1, saw_analysis: 1, saved_job: 1, practised: 0, came_back: 2 };
  let missing = false;
  let body = null;
  global.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return json(200, { id: 'u1', email: 'boss@example.com' });
    if (u.includes('/rpc/admin_funnel2')) { body = JSON.parse(init.body); return missing ? json(404, { code: 'PGRST202' }) : json(200, f); }
    if (u.includes('/rpc/admin_metrics')) return json(200, { people: 1, events: [] });
    return json(200, []);
  };
  await withEnv({ SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', ADMIN_EMAILS: 'boss@example.com' }, async () => {
    let res = mockRes();
    await plan({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: { op: 'metrics', days: '30' } }, res);
    assert.deepStrictEqual(res.out.funnel, f);
    assert.deepStrictEqual(body.p_exclude, ['boss@example.com'], 'the team is left out');
    missing = true;
    res = mockRes();
    await plan({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: { op: 'metrics', days: '30' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.out.funnel, null);
  });
});
