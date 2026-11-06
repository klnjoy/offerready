/**
 * Admin numbers by month (migration 0029): op=monthly calls admin_monthly
 * with p_months (1–24, default 12) and p_exclude = the team's emails, or []
 * with team=1. Admins only; a missing migration gives a clear 503.
 * node --test, global fetch stubbed.
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
function mockRes() {
  let out = null;
  return {
    statusCode: 200, headers: {},
    status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k] = v; },
    end(b) { if (b) out = JSON.parse(b); }, json(b) { out = b; return this; }, send(b) { out = typeof b === 'string' ? JSON.parse(b) : b; return this; },
    get out() { return out; },
  };
}
const realFetch = global.fetch;
test.afterEach(() => { global.fetch = realFetch; });

const ENV = {
  SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc',
  ADMIN_EMAILS: 'boss@example.com', METRICS_EXCLUDE_EMAILS: 'tester@x.com',
};
const ROWS = [{ month: '2026-11', ai_cost_usd: 1.5, ai_calls: 40 }];

function stub(email, rpc) {
  const calls = [];
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return json(200, { id: 'u1', email });
    const m = u.match(/\/rpc\/(\w+)/);
    if (m) { calls.push({ fn: m[1], body: JSON.parse(opts.body) }); return rpc(m[1]); }
    return json(200, []);
  };
  return calls;
}

test('months param: 1–24, default 12', () => {
  const plan = require('../me/plan');
  assert.strictEqual(plan._monthsParam(undefined), 12);
  assert.strictEqual(plan._monthsParam('3'), 3);
  assert.strictEqual(plan._monthsParam('0'), 12);
  assert.strictEqual(plan._monthsParam('99'), 24);
  assert.strictEqual(plan._monthsParam('-4'), 1);
});

test('op=monthly sends p_months and the team list; team=1 includes the team', async () => {
  const plan = require('../me/plan');
  const calls = stub('boss@example.com', () => json(200, ROWS));
  await withEnv(ENV, async () => {
    let res = mockRes();
    await plan({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: { op: 'monthly', months: '6' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.out, { months: 6, team: false, rows: ROWS });
    assert.deepStrictEqual(calls[0], { fn: 'admin_monthly', body: { p_months: 6, p_exclude: ['boss@example.com', 'tester@x.com'] } });
    res = mockRes();
    await plan({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: { op: 'monthly', team: '1' } }, res);
    assert.strictEqual(res.out.team, true);
    assert.deepStrictEqual(calls[1].body, { p_months: 12, p_exclude: [] });
    assert.strictEqual(res.headers['Cache-Control'], 'private, no-store');
  });
});

test('op=monthly: not an admin → 403, nothing read', async () => {
  const plan = require('../me/plan');
  const calls = stub('someone@else.com', () => json(200, ROWS));
  await withEnv(ENV, async () => {
    const res = mockRes();
    await plan({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: { op: 'monthly' } }, res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(calls.length, 0);
  });
});

test('op=monthly: migration not applied → 503 that names it', async () => {
  const plan = require('../me/plan');
  stub('boss@example.com', () => json(404, { message: 'function not found' }));
  await withEnv(ENV, async () => {
    const res = mockRes();
    await plan({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: { op: 'monthly' } }, res);
    assert.strictEqual(res.statusCode, 503);
    assert.match(res.out.error, /0029_admin_monthly\.sql/);
  });
});
