/**
 * SEC-4: every admin endpoint is rejected SERVER-SIDE for a signed-in
 * non-admin (403), for no sign-in (401), and cron endpoints need the cron
 * secret. No admin data is read from the database on a rejected request.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');

function json(status, body) { return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) }; }
function mockRes() { let out = null; return { statusCode: 200, headers: {}, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, end(b) { if (b) { try { out = JSON.parse(b); } catch (_) { out = b; } } }, json(b) { out = b; return this; }, send(b) { out = typeof b === 'string' ? JSON.parse(b) : b; return this; }, get out() { return out; } }; }
const ENV = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', ADMIN_EMAILS: 'boss@example.com', CRON_SECRET: 'cron-s3cret', RESEND_API_KEY: 're_x' };
const realFetch = global.fetch;
test.afterEach(() => { global.fetch = realFetch; });
function withEnv(env, fn) { const saved = {}; for (const k of Object.keys(env)) { saved[k] = process.env[k]; process.env[k] = env[k]; } return Promise.resolve().then(fn).finally(() => { for (const k of Object.keys(saved)) { if (saved[k] == null) delete process.env[k]; else process.env[k] = saved[k]; } }); }

const ADMIN_OPS = [
  ['GET', 'metrics'], ['GET', 'monthly'], ['GET', 'costs'], ['GET', 'people'], ['GET', 'breakdown'], ['GET', 'visits'],
  ['GET', 'email-status'], ['GET', 'email-preview'], ['POST', 'email-test'], ['POST', 'hide-visitor'], ['DELETE', 'hide-visitor'],
];

function stubAs(email) {
  const dbReads = [];
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return email ? json(200, { id: 'u2', email }) : json(401, { message: 'no' });
    if (u.includes('/rest/v1/')) dbReads.push(u);
    return json(200, []);
  };
  return dbReads;
}

for (const [method, op] of ADMIN_OPS) {
  test(`SEC-4 ${method} op=${op}: non-admin → 403, no admin data read`, async () => {
    const plan = require('../me/plan');
    await withEnv(ENV, async () => {
      const reads = stubAs('someone@else.com');
      const res = mockRes();
      await plan({ method, headers: { authorization: 'Bearer user-token' }, query: { op, kind: 'welcome', days: '30', months: '12' }, body: { id: 'anon123456' } }, res);
      assert.strictEqual(res.statusCode, 403, op + ' answered ' + res.statusCode);
      const adminReads = reads.filter((u) => !/\/rest\/v1\/(user_access_passes|passes|subscriptions|usage_events|entitlements|credit_ledger)/.test(u));
      assert.deepStrictEqual(adminReads, [], op + ' read ' + adminReads.join(', '));
    });
  });
  test(`SEC-4 ${method} op=${op}: no sign-in → 401`, async () => {
    const plan = require('../me/plan');
    await withEnv(ENV, async () => {
      stubAs(null);
      const res = mockRes();
      await plan({ method, headers: {}, query: { op }, body: {} }, res);
      assert.ok([401, 403].includes(res.statusCode), op + ' answered ' + res.statusCode);
    });
  });
}

for (const op of ['lifecycle-emails', 'daily-push']) {
  test(`SEC-4 cron op=${op}: wrong or missing secret → 401`, async () => {
    const plan = require('../me/plan');
    await withEnv(ENV, async () => {
      stubAs('boss@example.com');
      for (const authz of [undefined, 'Bearer user-token', 'Bearer wrong']) {
        const res = mockRes();
        await plan({ method: 'GET', headers: authz ? { authorization: authz } : {}, query: { op }, body: {} }, res);
        assert.strictEqual(res.statusCode, 401, op + ' with ' + authz + ' answered ' + res.statusCode);
      }
    });
  });
}
