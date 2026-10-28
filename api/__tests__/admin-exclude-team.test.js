/**
 * Admin numbers leave out the team's own accounts (migration 0023):
 * op=metrics / op=people call the <fn>2 functions with p_exclude =
 * ADMIN_EMAILS + METRICS_EXCLUDE_EMAILS, and fall back to the original
 * functions until 0023 is applied. node --test, global fetch stubbed.
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
  ADMIN_EMAILS: 'Boss@Example.com, two@x.com', METRICS_EXCLUDE_EMAILS: 'tester@x.com,boss@example.com',
};

test('team list = admins + extra emails, lower-cased, no duplicates', async () => {
  const plan = require('../me/plan');
  await withEnv(ENV, () => {
    assert.deepStrictEqual(plan._teamEmails(), ['boss@example.com', 'two@x.com', 'tester@x.com']);
  });
  await withEnv({ ADMIN_EMAILS: null, METRICS_EXCLUDE_EMAILS: null }, () => assert.deepStrictEqual(plan._teamEmails(), []));
});

test('op=metrics and op=people send p_exclude to the 0023 functions', async () => {
  const plan = require('../me/plan');
  const calls = [];
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return json(200, { id: 'u1', email: 'boss@example.com' });
    const m = u.match(/\/rpc\/(\w+)/);
    if (m) { calls.push({ fn: m[1], body: JSON.parse(opts.body) }); return json(200, m[1].startsWith('admin_people') ? { users: [], visitors: [] } : { people: 1, plans: [], geo: [] }); }
    return json(200, []);
  };
  await withEnv(ENV, async () => {
    let res = mockRes();
    await plan({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: { op: 'metrics', days: '30' } }, res);
    assert.strictEqual(res.statusCode, 200);
    res = mockRes();
    await plan({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: { op: 'people', days: '30' } }, res);
    assert.strictEqual(res.statusCode, 200);
  });
  for (const fn of ['admin_metrics2', 'admin_plans_geo2', 'admin_people2']) {
    const c = calls.find((x) => x.fn === fn);
    assert.ok(c, fn + ' called');
    assert.deepStrictEqual(c.body.p_exclude, ['boss@example.com', 'two@x.com', 'tester@x.com']);
    assert.ok(c.body.p_since);
  }
  assert.ok(!calls.some((x) => x.fn === 'admin_metrics' || x.fn === 'admin_people'), 'no fallback needed');
});

test('before migration 0023 the original functions are used and the dashboard still loads', async () => {
  const plan = require('../me/plan');
  const calls = [];
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return json(200, { id: 'u1', email: 'boss@example.com' });
    const m = u.match(/\/rpc\/(\w+)/);
    if (m) {
      calls.push({ fn: m[1], body: JSON.parse(opts.body) });
      if (m[1].endsWith('2')) return json(404, { code: 'PGRST202' });
      return json(200, m[1] === 'admin_people' ? { users: [{ id: 'a' }], visitors: [] } : { people: 7, plans: [], geo: [] });
    }
    return json(200, []);
  };
  await withEnv(ENV, async () => {
    let res = mockRes();
    await plan({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: { op: 'metrics', days: '7' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.out.metrics.people, 7);
    res = mockRes();
    await plan({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: { op: 'people', days: '7' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.out.people.users.length, 1);
  });
  const old = calls.find((x) => x.fn === 'admin_metrics');
  assert.ok(old && !('p_exclude' in old.body), 'original function gets only p_since');
});

test('non-admins still get 403 (team exclusion does not widen access)', async () => {
  const plan = require('../me/plan');
  global.fetch = async (url) => String(url).includes('/auth/v1/user') ? json(200, { id: 'u2', email: 'tester@x.com' }) : json(200, {});
  await withEnv(ENV, async () => {
    const res = mockRes();
    await plan({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: { op: 'metrics' } }, res);
    assert.strictEqual(res.statusCode, 403);
  });
});
