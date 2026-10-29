/**
 * GET /api/me/plan?op=visits: every event from not-signed-in browsers, grouped
 * by the same 8-char id as the people list, oldest first, with only the short
 * codes the app stores. Admins only. node --test, global fetch stubbed.
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
const ENV = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', ADMIN_EMAILS: 'boss@example.com' };

test('op=visits groups not-signed-in events by visitor and visit, oldest first', async () => {
  const plan = require('../me/plan');
  let asked = '';
  // PostgREST returns newest first (order=created_at.desc).
  const rows = [
    { anon_id: 'abcd1234zzzz', session_id: 's2', created_at: '2026-10-28T10:05:00Z', event: 'page_view', route: '/roles', props: { country: 'US', region: 'NC' }, release: 'r9' },
    { anon_id: 'ffff0000aaaa', session_id: 'x1', created_at: '2026-10-28T09:00:00Z', event: 'page_view', route: '/', props: {}, release: 'r9' },
    { anon_id: 'abcd1234zzzz', session_id: 's1', created_at: '2026-10-27T10:03:00Z', event: 'page_view', route: '/pricing', props: { secret: 'x' }, release: 'r8' },
    { anon_id: 'abcd1234zzzz', session_id: 's1', created_at: '2026-10-27T10:00:00Z', event: 'page_view', route: '/', props: { ref: 'linkedin.com', country: 'US' }, release: 'r8' },
  ];
  global.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return json(200, { id: 'u1', email: 'boss@example.com' });
    if (u.includes('/rest/v1/product_events')) { asked = u; assert.strictEqual(init.headers.Authorization, 'Bearer svc'); return json(200, rows); }
    return json(200, []);
  };
  await withEnv(ENV, async () => {
    const res = mockRes();
    await plan({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: { op: 'visits', days: '30' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.match(asked, /user_id=is\.null/);
    assert.match(asked, /created_at=gte\./);
    const a = res.out.visitors.find((v) => v.id === 'abcd1234');
    assert.strictEqual(a.visits, 2);
    assert.deepStrictEqual(a.events.map((e) => [e.route, e.visit]), [['/', 1], ['/pricing', 1], ['/roles', 2]]);
    assert.deepStrictEqual(a.events[0].props, { ref: 'linkedin.com', country: 'US' });
    assert.deepStrictEqual(a.events[1].props, {}, 'only the known short codes are passed on');
    assert.strictEqual(a.release, 'r9');
    assert.strictEqual(res.out.visitors.length, 2);
    assert.strictEqual(res.out.capped, false);
  });
});

test('op=visits is for admins only', async () => {
  const plan = require('../me/plan');
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return json(200, { id: 'u2', email: 'someone@example.com' });
    throw new Error('must not read events for a non-admin');
  };
  await withEnv(ENV, async () => {
    const res = mockRes();
    await plan({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: { op: 'visits' } }, res);
    assert.strictEqual(res.statusCode, 403);
  });
});

test('op=visits leaves out hidden visitors and passes tap/scroll codes', async () => {
  const plan = require('../me/plan');
  const rows = [
    { anon_id: 'aaaa1111zzzz', session_id: 's1', created_at: '2026-10-28T10:01:00Z', event: 'tap', route: '/', props: { label: 'Analyze my job', to: '/analyze' } },
    { anon_id: 'aaaa1111zzzz', session_id: 's1', created_at: '2026-10-28T10:00:30Z', event: 'scrolled', route: '/', props: { depth: 50 } },
    { anon_id: 'bbbb2222zzzz', session_id: 's2', created_at: '2026-10-28T10:00:00Z', event: 'page_view', route: '/', props: {} },
  ];
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return json(200, { id: 'u1', email: 'boss@example.com' });
    if (u.includes('/rest/v1/admin_hidden_visitors')) return json(200, [{ id: 'bbbb2222' }]);
    if (u.includes('/rest/v1/product_events')) return json(200, rows);
    return json(200, []);
  };
  await withEnv(ENV, async () => {
    const res = mockRes();
    await plan({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: { op: 'visits' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.out.hide_ready, true);
    assert.deepStrictEqual(res.out.visitors.map((v) => v.id), ['aaaa1111']);
    assert.deepStrictEqual(res.out.visitors[0].events.map((e) => [e.event, e.props]), [['scrolled', { depth: '50' }], ['tap', { label: 'Analyze my job', to: '/analyze' }]]);
  });
});

test('op=hide-visitor: admins mark or unmark an 8-char id; bad ids and non-admins are refused', async () => {
  const plan = require('../me/plan');
  const calls = [];
  let email = 'boss@example.com';
  global.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return json(200, { id: 'u1', email });
    if (u.includes('/rest/v1/admin_hidden_visitors')) { calls.push([init.method, u, init.body || null]); return json(201, null); }
    throw new Error('unexpected ' + u);
  };
  await withEnv(ENV, async () => {
    let res = mockRes();
    await plan({ method: 'POST', headers: { authorization: 'Bearer tok' }, query: { op: 'hide-visitor' }, body: { id: 'BFE2A536' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.out, { ok: true, id: 'bfe2a536', hidden: true });
    assert.strictEqual(calls[0][0], 'POST');
    assert.deepStrictEqual(JSON.parse(calls[0][2]), { id: 'bfe2a536', hidden_by: 'boss@example.com' });
    res = mockRes();
    await plan({ method: 'DELETE', headers: { authorization: 'Bearer tok' }, query: { op: 'hide-visitor', id: 'bfe2a536' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.match(calls[1][1], /id=eq\.bfe2a536$/);
    res = mockRes();
    await plan({ method: 'POST', headers: { authorization: 'Bearer tok' }, query: { op: 'hide-visitor' }, body: { id: 'x;drop' } }, res);
    assert.strictEqual(res.statusCode, 400);
    email = 'someone@example.com';
    res = mockRes();
    await plan({ method: 'POST', headers: { authorization: 'Bearer tok' }, query: { op: 'hide-visitor' }, body: { id: 'bfe2a536' } }, res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(calls.length, 2);
  });
});
