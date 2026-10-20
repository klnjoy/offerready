/**
 * Tests for api/_lib/aiCost.js: cost maths, the logged row, fail-safe writes,
 * the admin summary, and that a feature endpoint logs its call.
 * Supabase and OpenAI are stubbed through global.fetch.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const aiCost = require('../_lib/aiCost');

function json(status, body) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
}

function withEnv(env, fn) {
  const saved = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; if (env[k] == null) delete process.env[k]; else process.env[k] = env[k]; }
  const restore = () => { for (const k of Object.keys(saved)) { if (saved[k] == null) delete process.env[k]; else process.env[k] = saved[k]; } };
  return Promise.resolve().then(fn).finally(restore);
}

const USAGE = { prompt_tokens: 2000, completion_tokens: 500, prompt_tokens_details: { cached_tokens: 1024 } };

test('cost uses input, cached input and output prices', () => {
  // gpt-4o-mini: (976 * 0.15 + 1024 * 0.075 + 500 * 0.6) / 1e6
  const want = (976 * 0.15 + 1024 * 0.075 + 500 * 0.6) / 1e6;
  assert.ok(Math.abs(aiCost.costUsd('gpt-4o-mini-2024-07-18', USAGE) - want) < 1e-6);
  // gpt-4o is not mistaken for gpt-4o-mini (longest prefix wins) and vice versa.
  assert.strictEqual(aiCost.priceFor('gpt-4o-2024-08-06').key, 'gpt-4o');
  assert.strictEqual(aiCost.priceFor('gpt-4o-mini').key, 'gpt-4o-mini');
  const unknown = aiCost.priceFor('some-new-model');
  assert.strictEqual(unknown.priced, false);
});

test('row holds numbers only and cleans bad input', () => {
  const r = aiCost._row('coach', { model: 'gpt-4o-mini', usage: USAGE, choices: [{ message: { content: 'secret answer' } }] }, 1234, 'u1');
  assert.deepStrictEqual(Object.keys(r).sort(), ['cached_tokens', 'cost_usd', 'feature', 'input_tokens', 'model', 'ms', 'ok', 'output_tokens', 'priced', 'user_id'].sort());
  assert.strictEqual(r.input_tokens, 2000);
  assert.strictEqual(r.cached_tokens, 1024);
  assert.strictEqual(r.output_tokens, 500);
  assert.strictEqual(r.user_id, 'u1');
  assert.ok(!JSON.stringify(r).includes('secret'));
  const bad = aiCost._row('Bad Feature!', { usage: { prompt_tokens: 10, prompt_tokens_details: { cached_tokens: 99 } } }, -5, null);
  assert.strictEqual(bad.feature, 'other');
  assert.strictEqual(bad.cached_tokens, 10, 'cached never exceeds input');
  assert.strictEqual(bad.ms, 0);
});

test('track writes one row with the service key, and never throws', async () => {
  const calls = [];
  global.fetch = async (url, opts) => { calls.push({ url, opts }); return json(201, null); };
  await withEnv({ SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' }, async () => {
    await aiCost.track('grade_answer', { model: 'gpt-4o-mini', usage: USAGE }, Date.now() - 50, 'u1');
  });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, 'https://p.supabase.co/rest/v1/ai_calls');
  assert.strictEqual(calls[0].opts.headers.Authorization, 'Bearer svc');
  const body = JSON.parse(calls[0].opts.body);
  assert.strictEqual(body.feature, 'grade_answer');

  // Storage down: no throw.
  global.fetch = async () => { throw new Error('network'); };
  await withEnv({ SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' }, async () => {
    await aiCost.track('coach', { usage: USAGE }, Date.now());
  });
  // Not configured: no request at all.
  let n = 0;
  global.fetch = async () => { n++; return json(201, null); };
  await withEnv({ SUPABASE_URL: null, SUPABASE_SERVICE_ROLE_KEY: null }, async () => {
    await aiCost.track('coach', { usage: USAGE }, Date.now());
  });
  assert.strictEqual(n, 0);
});

test('isAdmin reads ADMIN_EMAILS, case-insensitive', async () => {
  await withEnv({ ADMIN_EMAILS: ' Boss@Example.com , other@x.com' }, () => {
    assert.strictEqual(aiCost.isAdmin('boss@example.com'), true);
    assert.strictEqual(aiCost.isAdmin('someone@example.com'), false);
    assert.strictEqual(aiCost.isAdmin(''), false);
  });
  await withEnv({ ADMIN_EMAILS: null }, () => assert.strictEqual(aiCost.isAdmin('boss@example.com'), false));
});

test('GET /api/me/plan?op=costs: admins get the summary, others 403', async () => {
  const plan = require('../me/plan');
  const rows = [{ feature: 'coach', calls: 3, cost_usd: 0.0012 }];
  const mk = (email) => {
    global.fetch = async (url) => {
      if (String(url).includes('/auth/v1/user')) return json(200, { id: 'u1', email });
      if (String(url).includes('/rpc/ai_cost_summary')) return json(200, rows);
      return json(200, []);
    };
  };
  const run = async () => {
    let out = null;
    const res = { statusCode: 200, headers: {}, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, end(b) { if (b) out = JSON.parse(b); }, json(b) { out = b; return this; }, send(b) { out = typeof b === 'string' ? JSON.parse(b) : b; return this; } };
    await plan({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: { op: 'costs', days: '7' } }, res);
    return { status: res.statusCode, out };
  };
  await withEnv({ SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', ADMIN_EMAILS: 'boss@example.com' }, async () => {
    mk('boss@example.com');
    const a = await run();
    assert.strictEqual(a.status, 200);
    assert.strictEqual(a.out.days, 7);
    assert.deepStrictEqual(a.out.rows, rows);
    mk('user@example.com');
    const b = await run();
    assert.strictEqual(b.status, 403);
  });
});

test('GET /api/me/plan?op=metrics: admins get metrics + costs; others 403; missing function -> 503 setup', async () => {
  const plan = require('../me/plan');
  const metrics = { people: 12, events: [{ event: 'page_view', count: 40, people: 12 }] };
  let fnMissing = false;
  const mk = (email) => {
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/auth/v1/user')) return json(200, { id: 'u1', email });
      if (u.includes('/rpc/admin_metrics')) return fnMissing ? json(404, { code: 'PGRST202' }) : json(200, metrics);
      if (u.includes('/rpc/ai_cost_summary')) return json(200, [{ feature: 'coach', calls: 1 }]);
      return json(200, []);
    };
  };
  const run = async () => {
    let out = null;
    const res = { statusCode: 200, headers: {}, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, end(b) { if (b) out = JSON.parse(b); }, json(b) { out = b; return this; }, send(b) { out = typeof b === 'string' ? JSON.parse(b) : b; return this; } };
    await plan({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: { op: 'metrics', days: '7' } }, res);
    return { status: res.statusCode, out };
  };
  await withEnv({ SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', ADMIN_EMAILS: 'boss@example.com' }, async () => {
    mk('boss@example.com');
    const a = await run();
    assert.strictEqual(a.status, 200);
    assert.deepStrictEqual(a.out.metrics, metrics);
    assert.strictEqual(a.out.costs.rows.length, 1);
    fnMissing = true;
    const c = await run();
    assert.strictEqual(c.status, 503);
    assert.strictEqual(c.out.setup, true);
    fnMissing = false;
    mk('user@example.com');
    assert.strictEqual((await run()).status, 403);
  });
});
