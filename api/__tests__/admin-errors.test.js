/** Admin error summary (op=errors): admins only, grouped, no user data out. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');

function json(status, body) { return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) }; }
function mockRes() { let out = null; return { statusCode: 200, headers: {}, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, end(b) { if (b) out = JSON.parse(b); }, json(b) { out = b; return this; }, send(b) { out = typeof b === 'string' ? JSON.parse(b) : b; return this; }, get out() { return out; } }; }
const ENV = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', ADMIN_EMAILS: 'boss@example.com' };
const realFetch = global.fetch;
test.afterEach(() => { global.fetch = realFetch; });
function withEnv(env, fn) { const saved = {}; for (const k of Object.keys(env)) { saved[k] = process.env[k]; process.env[k] = env[k]; } return Promise.resolve().then(fn).finally(() => { for (const k of Object.keys(saved)) { if (saved[k] == null) delete process.env[k]; else process.env[k] = saved[k]; } }); }

const ROWS = [
  { created_at: '2026-11-06T10:00:00Z', route: '/coach?q=1', message: 'TypeError: x is undefined at 123', stack: 'TypeError\n    at render (https://getofferready.app/assets/Copilot-AB12.js:10:5)', release: 'abc123456789xyz', user_id: 'u1', ua: 'Mozilla' },
  { created_at: '2026-11-06T11:00:00Z', route: '/coach', message: 'TypeError: x is undefined at 456', stack: null, release: 'abc123456789xyz' },
  { created_at: '2026-11-05T09:00:00Z', route: '/jobs', message: 'Failed to fetch', stack: null, release: 'def' },
];

test('groups by normalized message, newest data, no user ids or browsers', () => {
  const plan = require('../me/plan');
  const g = plan._groupErrors(ROWS);
  assert.strictEqual(g.total, 3);
  assert.strictEqual(g.groups.length, 2);
  assert.strictEqual(g.groups[0].count, 2);
  assert.deepStrictEqual(g.groups[0].routes, [{ k: '/coach', n: 2 }]);
  assert.strictEqual(g.groups[0].last_seen, '2026-11-06T11:00:00Z');
  assert.match(g.groups[0].frame, /^at render \(\/assets\/Copilot/);
  assert.ok(!JSON.stringify(g).includes('u1') && !JSON.stringify(g).includes('Mozilla'));
});

test('op=errors: admin gets the summary; others get 403 and nothing is read', async () => {
  const plan = require('../me/plan');
  let email = 'boss@example.com'; let reads = 0;
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return json(200, { id: 'u1', email });
    if (u.includes('/rest/v1/client_errors')) { reads++; assert.match(u, /select=created_at,route,message,stack,release/); return json(200, ROWS); }
    return json(200, []);
  };
  await withEnv(ENV, async () => {
    let res = mockRes();
    await plan({ method: 'GET', headers: { authorization: 'Bearer t' }, query: { op: 'errors', days: '7' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.out.groups.length, 2);
    assert.strictEqual(res.headers['Cache-Control'], 'private, no-store');
    email = 'someone@else.com';
    res = mockRes();
    await plan({ method: 'GET', headers: { authorization: 'Bearer t' }, query: { op: 'errors' } }, res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(reads, 1);
  });
});
