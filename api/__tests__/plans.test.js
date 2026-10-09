/**
 * Tests for api/_lib/plans.js (Free vs Pro limits) and the endpoints that
 * enforce them. Uses Node's built-in test runner (node --test), no deps.
 * Supabase (PostgREST) and OpenAI are stubbed through global.fetch.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const plans = require('../_lib/plans');
const rateLimit = require('../_lib/rateLimit');
const { PRO_FEATURES } = require('../_lib/billing');

const SB = 'https://proj.supabase.co';
const USER = '11111111-1111-1111-1111-111111111111';

function json(status, body, headers) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => (headers || {})[String(k).toLowerCase()] || null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/**
 * Install a fetch stub. `world` describes Supabase state:
 *   pro: boolean | 'error'         entitlements lookup
 *   counts: {feature: n} | 'error' | 'missing'   usage_counts RPC
 *   jobs: number | 'error'
 *   insert: 'ok' | 'error'
 *   openai: content object | 'error'
 */
function stub(world) {
  const calls = [];
  const orig = global.fetch;
  global.fetch = async (url, opts) => {
    const u = String(url);
    const o = opts || {};
    calls.push({ url: u, method: o.method || 'GET', body: o.body ? JSON.parse(o.body) : null });
    if (u.startsWith(SB + '/auth/v1/user')) {
      const auth = (o.headers && o.headers.Authorization) || '';
      return auth === 'Bearer good-token' ? json(200, { id: USER, email: 'a@b.c' }) : json(401, {});
    }
    if (u.startsWith(SB + '/rest/v1/entitlements')) {
      if (world.pro === 'error') throw Object.assign(new Error('net'), { name: 'TypeError' });
      return json(200, world.pro ? [{ feature: 'interview_pro' }] : []);
    }
    if (u.startsWith(SB + '/rest/v1/passes')) {
      if (world.passes === 'error') return json(404, { code: '42P01' });
      const now = Date.now();
      return json(200, (world.passes || []).filter((r) => Date.parse(r.expires_at) > now));
    }
    if (u.startsWith(SB + '/rest/v1/rpc/credit_balance')) {
      return json(200, Object.keys(world.credits || {}).map((f) => ({ feature: f, balance: world.credits[f] })));
    }
    if (u.startsWith(SB + '/rest/v1/credit_ledger')) {
      (world.debits = world.debits || []).push(JSON.parse(o.body));
      return json(201, null);
    }
    if (u.startsWith(SB + '/rest/v1/rpc/usage_counts')) {
      if (world.counts === 'error') throw Object.assign(new Error('net'), { name: 'TypeError' });
      if (world.counts === 'missing') return json(404, { code: 'PGRST202', message: 'Could not find the function' });
      const c = world.counts || {};
      const want = JSON.parse(o.body).p_feature;
      return json(200, Object.keys(c).filter((f) => !want || f === want).map((f) => ({ feature: f, used: c[f] })));
    }
    if (u.startsWith(SB + '/rest/v1/usage_events')) {
      return world.insert === 'error' ? json(404, { code: '42P01' }) : json(201, null);
    }
    if (u.startsWith(SB + '/rest/v1/jobs')) {
      if (world.jobs === 'error') throw Object.assign(new Error('net'), { name: 'TypeError' });
      if (o.method === 'POST') return json(201, [{ id: 'job-new', title: 'X' }]);
      const n = world.jobs || 0;
      return json(200, [], { 'content-range': n ? `0-${n - 1}/${n}` : '*/0' });
    }
    if (u.startsWith('https://api.openai.com/')) {
      if (world.openai === 'error') return json(500, {});
      return json(200, { model: 'gpt-test', choices: [{ message: { content: JSON.stringify(world.openai || {}) } }] });
    }
    throw new Error('unexpected fetch ' + u);
  };
  return { calls, restore: () => { global.fetch = orig; } };
}

function fakeRes() {
  const res = { statusCode: 0, headers: {}, body: '' };
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
  res.end = (b) => { res.body = b || ''; return res; };
  res.json = () => JSON.parse(res.body);
  return res;
}

function req(method, body, token) {
  const headers = { origin: 'https://klnjoy.github.io', 'x-forwarded-for': '203.0.113.' + Math.floor(Math.random() * 250) };
  if (token) headers.authorization = 'Bearer ' + token;
  return { method, headers, body };
}

let errSpy;
test.beforeEach(() => {
  process.env.SUPABASE_URL = SB;
  process.env.SUPABASE_ANON_KEY = 'anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  plans._internal._reset();
  rateLimit._internal._reset();
  errSpy = [];
  test.mock.method(console, 'error', (...a) => { errSpy.push(a.join(' ')); });
});
test.afterEach(() => {
  test.mock.restoreAll();
  delete process.env.OPENAI_API_KEY;
});

// ---- limits contract ----------------------------------------------------------

test('LIMITS: the decided Free/Pro numbers (must match src/lib/plans.ts)', () => {
  assert.deepEqual(plans.LIMITS.free, { saved_jobs: 1, analyses: 3, ai_grading: 5, voice_mock: 1, custom_scenarios: 0, premium_scenarios: 0, story_ai: 3, prep_plan: null, resume_tailor: 2 });
  assert.deepEqual(plans.LIMITS.pro, { saved_jobs: null, analyses: 60, ai_grading: 400, voice_mock: 40, custom_scenarios: 40, premium_scenarios: null, story_ai: 150, prep_plan: null, resume_tailor: 100 });
});

test('periodStart / periodEnd: UTC calendar month', () => {
  assert.equal(plans.periodStart(new Date('2026-10-31T23:59:59Z')), '2026-10-01T00:00:00.000Z');
  assert.equal(plans.periodEnd(new Date('2026-12-15T00:00:00Z')), '2027-01-01T00:00:00.000Z');
});

// ---- Pro detection --------------------------------------------------------------

test('getPlan: active Pro-bundle entitlement => pro; query covers the whole bundle, active + unexpired', async () => {
  const s = stub({ pro: true });
  try {
    assert.equal(await plans.getPlan(USER), 'pro');
    const q = decodeURIComponent(s.calls.find((c) => c.url.includes('/entitlements')).url);
    for (const f of PRO_FEATURES) assert.ok(q.includes(`"${f}"`), 'bundle includes ' + f);
    assert.ok(q.includes('status=eq.active'));
    assert.ok(q.includes('expires_at.is.null'));
  } finally { s.restore(); }
});

test('getPlan: no entitlement => free', async () => {
  const s = stub({ pro: false });
  try { assert.equal(await plans.getPlan(USER), 'free'); } finally { s.restore(); }
});

test('getPlan: cached per user for 60s (one Supabase call for repeated checks)', async () => {
  const s = stub({ pro: true });
  try {
    await plans.getPlan(USER); await plans.getPlan(USER); await plans.checkQuota(USER, 'analyses');
    assert.equal(s.calls.filter((c) => c.url.includes('/entitlements')).length, 1);
    // Expire the entry -> looked up again.
    plans._internal.planCache.get(USER).at -= 61 * 1000;
    await plans.getPlan(USER);
    assert.equal(s.calls.filter((c) => c.url.includes('/entitlements')).length, 2);
  } finally { s.restore(); }
});

test('getPlan: a failed lookup is not cached', async () => {
  let s = stub({ pro: 'error' });
  try { assert.equal(await plans.getPlan(USER), 'free'); } finally { s.restore(); }
  s = stub({ pro: true });
  try { assert.equal(await plans.getPlan(USER), 'pro'); } finally { s.restore(); }
});

// ---- quota math -----------------------------------------------------------------

test('checkQuota: Free analyses 0,1,2 used => ok; 3 used => blocked', async () => {
  for (const [used, ok] of [[0, true], [2, true], [3, false], [7, false]]) {
    plans._internal._reset();
    const s = stub({ pro: false, counts: { analyses: used, ai_grading: 99 } });
    try {
      const q = await plans.checkQuota(USER, 'analyses');
      assert.deepEqual({ ok: q.ok, plan: q.plan, used: q.used, limit: q.limit }, { ok, plan: 'free', used, limit: 3 });
      const rpc = s.calls.find((c) => c.url.includes('/rpc/usage_counts'));
      assert.equal(rpc.body.p_user, USER);
      assert.equal(rpc.body.p_feature, 'analyses');
      assert.equal(rpc.body.p_since, plans.periodStart());
    } finally { s.restore(); }
  }
});

test('checkQuota: Pro fair-use caps', async () => {
  const s = stub({ pro: true, counts: { ai_grading: 399, analyses: 60 } });
  try {
    assert.equal((await plans.checkQuota(USER, 'ai_grading')).ok, true);
    const a = await plans.checkQuota(USER, 'analyses');
    assert.deepEqual([a.ok, a.plan, a.used, a.limit], [false, 'pro', 60, 60]);
  } finally { s.restore(); }
});

test('checkQuota: limit 0 blocks without a usage query; unlimited allows without one', async () => {
  const s = stub({ pro: false });
  try {
    const c = await plans.checkQuota(USER, 'custom_scenarios');
    assert.deepEqual([c.ok, c.used, c.limit], [false, 0, 0]);
    const p = await plans.checkQuota(USER, 'prep_plan');
    assert.deepEqual([p.ok, p.limit], [true, null]);
    assert.equal(s.calls.filter((x) => x.url.includes('/rpc/')).length, 0);
  } finally { s.restore(); }
});

test('checkQuota: saved_jobs counts jobs rows, not usage events', async () => {
  let s = stub({ pro: false, jobs: 1, counts: { saved_jobs: 0 } });
  try {
    const q = await plans.checkQuota(USER, 'saved_jobs');
    assert.deepEqual([q.ok, q.used, q.limit], [false, 1, 1]);
    assert.ok(s.calls.some((c) => c.url.includes('/rest/v1/jobs?')));
    assert.ok(!s.calls.some((c) => c.url.includes('/rpc/')));
  } finally { s.restore(); }
  plans._internal._reset();
  s = stub({ pro: true, jobs: 25 });
  try {
    const q = await plans.checkQuota(USER, 'saved_jobs');
    assert.deepEqual([q.ok, q.plan, q.limit], [true, 'pro', null]);
  } finally { s.restore(); }
});

test('checkQuota: unknown feature is allowed', async () => {
  const s = stub({ pro: false });
  try { assert.equal((await plans.checkQuota(USER, 'nope')).ok, true); } finally { s.restore(); }
});

// ---- fail-safe ------------------------------------------------------------------

test('fail-safe: usage_counts missing (migration not applied) => allowed, logged once', async () => {
  const s = stub({ pro: false, counts: 'missing' });
  try {
    const a = await plans.checkQuota(USER, 'analyses');
    const b = await plans.checkQuota(USER, 'ai_grading');
    assert.equal(a.ok, true); assert.equal(a.unknown, true);
    assert.equal(b.ok, true);
    assert.equal(errSpy.filter((m) => m.includes('usage-count-failed')).length, 1);
  } finally { s.restore(); }
});

test('fail-safe: network error on usage / plan / jobs => allowed', async () => {
  let s = stub({ pro: false, counts: 'error' });
  try { assert.equal((await plans.checkQuota(USER, 'voice_mock')).ok, true); } finally { s.restore(); }
  plans._internal._reset();
  s = stub({ pro: 'error', counts: { analyses: 50 } });
  try {
    const q = await plans.checkQuota(USER, 'custom_scenarios');
    assert.equal(q.ok, true, 'unknown plan never blocks, even a Free-zero feature');
    assert.equal(q.unknown, true);
  } finally { s.restore(); }
  plans._internal._reset();
  s = stub({ pro: false, jobs: 'error' });
  try { assert.equal((await plans.checkQuota(USER, 'saved_jobs')).ok, true); } finally { s.restore(); }
});

test('fail-safe: Supabase not configured => allowed', async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const s = stub({});
  try {
    assert.equal((await plans.checkQuota(USER, 'analyses')).ok, true);
    await plans.recordUse(USER, 'analyses');
    assert.equal(s.calls.length, 0);
  } finally { s.restore(); }
});

test('recordUse: inserts {user_id, feature} with the service role; never throws on error', async () => {
  let s = stub({ insert: 'ok' });
  try {
    await plans.recordUse(USER, 'ai_grading');
    const c = s.calls.find((x) => x.url.endsWith('/rest/v1/usage_events'));
    assert.equal(c.method, 'POST');
    assert.deepEqual(c.body, { user_id: USER, feature: 'ai_grading' });
    await plans.recordUse(USER, 'saved_jobs'); // not metered
    assert.equal(s.calls.filter((x) => x.url.includes('usage_events')).length, 1);
  } finally { s.restore(); }
  s = stub({ insert: 'error' });
  try { await plans.recordUse(USER, 'analyses'); } finally { s.restore(); }
});

// ---- 403 shape ------------------------------------------------------------------

test('quotaError: Free over quota -> upgrade body with friendly message', () => {
  const b = plans.quotaError({ ok: false, plan: 'free', used: 1, limit: 1 }, 'voice_mock');
  assert.equal(b.error, "You've used 1 of 1 voice sessions this month on Free. Get a pass or a mock pack for more.");
  assert.equal(b.pack, true);
  assert.equal(b.upgrade, true);
  assert.equal(b.feature, 'voice_mock');
  assert.equal(b.used, 1); assert.equal(b.limit, 1); assert.equal(b.plan, 'free');
  assert.ok(b.resets_at);
  const g = plans.quotaError({ ok: false, plan: 'free', used: 5, limit: 5 }, 'ai_grading');
  assert.match(g.error, /5 of 5 AI answer gradings this month on Free/);
  assert.match(plans.quotaError({ ok: false, plan: 'free', used: 0, limit: 0 }, 'custom_scenarios').error, /Custom scenarios come with any pass/);
  const j = plans.quotaError({ ok: false, plan: 'free', used: 1, limit: 1 }, 'saved_jobs');
  assert.match(j.error, /Free includes 1 saved job/);
  assert.equal(j.resets_at, undefined);
});

test('quotaError: Pro at a fair-use cap is not told to upgrade (unless a mock pack helps)', () => {
  const g = plans.quotaError({ ok: false, plan: 'pro', used: 400, limit: 400 }, 'ai_grading');
  assert.equal(g.upgrade, false);
  assert.match(g.error, /fair-use limit of 400 AI answer gradings on Pro/);
  assert.ok(g.resets_at);
  const b = plans.quotaError({ ok: false, plan: 'pro', used: 40, limit: 40 }, 'voice_mock');
  assert.equal(b.upgrade, true);
  assert.match(b.error, /fair-use limit of 40 voice sessions on Pro\. It resets on the 1st \(UTC\)\. Add a mock pack/);
});

// ---- summary (GET /api/me/plan) -------------------------------------------------

test('GET /api/me/plan: 401 without a token', async () => {
  const handler = require('../me/plan');
  const s = stub({});
  try {
    const res = fakeRes();
    await handler(req('GET'), res);
    assert.equal(res.statusCode, 401);
  } finally { s.restore(); }
});

test('GET /api/me/plan: plan + usage + limits + period_start', async () => {
  const handler = require('../me/plan');
  const s = stub({ pro: false, counts: { analyses: 2, voice_mock: 1 }, jobs: 1 });
  try {
    const res = fakeRes();
    await handler(req('GET', undefined, 'good-token'), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://klnjoy.github.io');
    const b = res.json();
    assert.equal(b.plan, 'free');
    assert.equal(b.usage_known, true);
    assert.deepEqual(b.usage.analyses, { used: 2, limit: 3 });
    assert.deepEqual(b.usage.voice_mock, { used: 1, limit: 1 });
    assert.deepEqual(b.usage.ai_grading, { used: 0, limit: 5 });
    assert.deepEqual(b.usage.saved_jobs, { used: 1, limit: 1 });
    assert.deepEqual(b.usage.prep_plan, { used: 0, limit: null });
    assert.deepEqual(b.limits.free, plans.LIMITS.free);
    assert.deepEqual(b.limits.pro, plans.LIMITS.pro);
    assert.ok(b.limits.passes.pass90);
    assert.equal(b.pass, null);
    assert.equal(b.period_start, plans.periodStart());
  } finally { s.restore(); }
});

test('GET /api/me/plan: usage storage missing -> still 200 with plan, usage unknown', async () => {
  const handler = require('../me/plan');
  const s = stub({ pro: true, counts: 'missing', jobs: 3 });
  try {
    const res = fakeRes();
    await handler(req('GET', undefined, 'good-token'), res);
    assert.equal(res.statusCode, 200);
    const b = res.json();
    assert.equal(b.plan, 'pro');
    assert.equal(b.usage_known, false);
    assert.deepEqual(b.usage.analyses, { used: null, limit: 60, unknown: true });
    assert.deepEqual(b.usage.saved_jobs, { used: 3, limit: null });
  } finally { s.restore(); }
});

// ---- endpoint enforcement -------------------------------------------------------

// Rubric-shaped reply (api/_lib/gradeAnswer.js); 'Q?' maps to the general rubric.
const GOOD_GRADE = { criteria: ['answer', 'mechanism', 'tradeoff', 'example', 'risks'].map((id) => ({ id, rating: 2, evidence: 'my answer here', note: '' })), verdict: 'Solid', staff_upgrade: '', followup: 'Why?' };

test('grade-answer: Free over quota -> 403 upgrade shape, no OpenAI call, nothing recorded', async () => {
  process.env.OPENAI_API_KEY = 'k';
  const handler = require('../premium/grade-answer');
  const s = stub({ pro: false, counts: { ai_grading: 5 } });
  try {
    const res = fakeRes();
    await handler(req('POST', { prompt: 'Q?', answer: 'my answer here' }, 'good-token'), res);
    assert.equal(res.statusCode, 403);
    const b = res.json();
    assert.deepEqual(Object.keys(b).sort(), ['error', 'feature', 'limit', 'plan', 'resets_at', 'upgrade', 'used']);
    assert.deepEqual([b.upgrade, b.feature, b.used, b.limit, b.plan], [true, 'ai_grading', 5, 5, 'free']);
    assert.ok(!s.calls.some((c) => c.url.includes('openai')));
    assert.ok(!s.calls.some((c) => c.url.includes('usage_events')));
  } finally { s.restore(); }
});

test('grade-answer: Free within quota -> graded, use recorded after success', async () => {
  process.env.OPENAI_API_KEY = 'k';
  const handler = require('../premium/grade-answer');
  const s = stub({ pro: false, counts: { ai_grading: 2 }, openai: GOOD_GRADE });
  try {
    const res = fakeRes();
    await handler(req('POST', { prompt: 'Q?', answer: 'my answer here' }, 'good-token'), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().feedback.verdict, 'Solid');
    const rec = s.calls.filter((c) => c.url.endsWith('/usage_events'));
    assert.equal(rec.length, 1);
    assert.deepEqual(rec[0].body, { user_id: USER, feature: 'ai_grading' });
    const iOpen = s.calls.findIndex((c) => c.url.includes('openai'));
    const iRec = s.calls.findIndex((c) => c.url.endsWith('/usage_events'));
    assert.ok(iOpen < iRec, 'recorded after the AI call');
  } finally { s.restore(); }
});

test('grade-answer: failed AI call records nothing', async () => {
  process.env.OPENAI_API_KEY = 'k';
  const handler = require('../premium/grade-answer');
  const s = stub({ pro: false, counts: {}, openai: 'error' });
  try {
    const res = fakeRes();
    await handler(req('POST', { prompt: 'Q?', answer: 'my answer here' }, 'good-token'), res);
    assert.equal(res.statusCode, 502);
    assert.ok(!s.calls.some((c) => c.url.endsWith('/usage_events')));
  } finally { s.restore(); }
});

test('scenarios/generate: Free -> 403 custom_scenarios upgrade', async () => {
  process.env.OPENAI_API_KEY = 'k';
  const handler = require('../premium/scenarios/generate');
  const s = stub({ pro: false });
  try {
    const res = fakeRes();
    await handler(req('POST', { targetRole: 'AI Engineer' }, 'good-token'), res);
    assert.equal(res.statusCode, 403);
    const b = res.json();
    assert.deepEqual([b.upgrade, b.feature, b.used, b.limit, b.plan], [true, 'custom_scenarios', 0, 0, 'free']);
  } finally { s.restore(); }
});

test('jobs POST: Free with 1 saved job -> 403 saved_jobs (aligned with plans.js)', async () => {
  const handler = require('../jobs/index');
  const s = stub({ pro: false, jobs: 1 });
  try {
    const res = fakeRes();
    await handler(req('POST', { analysis: { roleSummary: 'Builds things.' } }, 'good-token'), res);
    assert.equal(res.statusCode, 403);
    const b = res.json();
    assert.deepEqual([b.upgrade, b.feature, b.used, b.limit, b.plan], [true, 'saved_jobs', 1, 1, 'free']);
  } finally { s.restore(); }
});

test('jobs POST: Pro with many jobs -> saved', async () => {
  const handler = require('../jobs/index');
  const s = stub({ pro: true, jobs: 12 });
  try {
    const res = fakeRes();
    await handler(req('POST', { analysis: { roleSummary: 'Builds things.' } }, 'good-token'), res);
    assert.equal(res.statusCode, 201);
  } finally { s.restore(); }
});

test('ai analyze_jd: signed-in Free over quota -> 403 analyses; anonymous -> 401 sign-in (not metered)', async () => {
  process.env.OPENAI_API_KEY = 'k';
  const handler = require('../ai');
  const body = { action: 'analyze_jd', jobDescription: 'We are hiring a senior data engineer to build pipelines with Snowflake and dbt. '.repeat(3) };
  let s = stub({ pro: false, counts: { analyses: 3 } });
  try {
    const res = fakeRes();
    await handler(req('POST', body, 'good-token'), res);
    assert.equal(res.statusCode, 403);
    const b = res.json();
    assert.deepEqual([b.upgrade, b.feature, b.used, b.limit], [true, 'analyses', 3, 3]);
    assert.ok(!s.calls.some((c) => c.url.includes('openai')));
  } finally { s.restore(); }
  s = stub({ pro: false, counts: { analyses: 3 }, openai: 'error' });
  try {
    const res = fakeRes();
    await handler(req('POST', body), res);
    assert.equal(res.statusCode, 401, 'anonymous runs must sign in first');
    assert.equal(res.json().signin, true);
    assert.ok(!s.calls.some((c) => c.url.includes('supabase')));
  } finally { s.restore(); }
});

// ---- one-time passes + mock credits (api/_lib/passes.js) -----------------------------

const DAYMS = 24 * 60 * 60 * 1000;
function passRow(kind, startOffsetDays, days) {
  const s0 = Date.now() + startOffsetDays * DAYMS;
  return { kind, starts_at: new Date(s0).toISOString(), expires_at: new Date(s0 + days * DAYMS).toISOString() };
}

test('pass: a live 90-day pass makes the user pro with the pass allowance, counted since it started', async () => {
  plans._internal._reset();
  const p = passRow('pass90', -10, 90);
  const s = stub({ passes: [p], counts: { analyses: 79 } });
  try {
    const q = await plans.checkQuota(USER, 'analyses');
    assert.deepEqual({ ok: q.ok, plan: q.plan, used: q.used, limit: q.limit, pass: q.pass }, { ok: true, plan: 'pro', used: 79, limit: 80, pass: 'pass90' });
    const rpc = s.calls.find((c) => c.url.includes('/rpc/usage_counts'));
    assert.equal(rpc.body.p_since, p.starts_at);
    assert.equal(s.calls.filter((c) => c.url.includes('/entitlements')).length, 0, 'no entitlement lookup needed');
  } finally { s.restore(); }
});

test('pass: allowance is for the whole pass, not monthly; over it the message offers another pass', async () => {
  plans._internal._reset();
  const s = stub({ passes: [passRow('pass30', -3, 30)], counts: { analyses: 30 } });
  try {
    const q = await plans.checkQuota(USER, 'analyses');
    assert.equal(q.ok, false);
    const b = plans.quotaError(q, 'analyses');
    assert.match(b.error, /used all 30 job analyses in your 30-day pass\. Buy another pass/);
    assert.equal(b.upgrade, true);
    assert.equal(b.pass, 'pass30');
    assert.equal(b.resets_at, undefined);
  } finally { s.restore(); }
});

test('pass: a queued pass adds its allowance straight away', async () => {
  plans._internal._reset();
  const a = passRow('pass30', -20, 30);
  const b = { kind: 'pass90', starts_at: a.expires_at, expires_at: new Date(Date.parse(a.expires_at) + 90 * DAYMS).toISOString() };
  const s = stub({ passes: [a, b], counts: { voice_mock: 20 }, jobs: 3 });
  try {
    const q = await plans.checkQuota(USER, 'voice_mock');
    assert.equal(q.limit, 28);
    assert.equal(q.ok, true);
    const sum = await plans.getUsageSummary(USER);
    assert.equal(sum.pass.kind, 'pass30');
    assert.deepEqual(sum.pass.kinds, ['pass30', 'pass90']);
    assert.equal(sum.pass.expires_at, b.expires_at);
    assert.equal(sum.period_start, a.starts_at);
    assert.deepEqual(sum.usage.saved_jobs, { used: 3, limit: 20 });
  } finally { s.restore(); }
});

test('pass: passes table missing -> falls back to entitlements (fail open)', async () => {
  plans._internal._reset();
  const s = stub({ passes: 'error', pro: true, counts: {} });
  try {
    const q = await plans.checkQuota(USER, 'analyses');
    assert.equal(q.plan, 'pro');
    assert.equal(q.limit, plans.LIMITS.pro.analyses);
  } finally { s.restore(); }
});

test('credits: over the voice allowance a mock credit lets it through and recordUse spends one', async () => {
  plans._internal._reset();
  const world = { pro: false, counts: { voice_mock: 1 }, credits: { voice_mock: 3 } };
  const s = stub(world);
  try {
    const q = await plans.checkQuota(USER, 'voice_mock');
    assert.equal(q.ok, true);
    assert.equal(q.credit, true);
    assert.equal(q.credits, 3);
    await plans.recordUse(USER, 'voice_mock');
    assert.deepEqual(world.debits.map((d) => [d.feature, d.delta]), [['voice_mock', -1]]);
  } finally { s.restore(); }
});

test('credits: within the allowance no credit is spent; with no credits the limit holds', async () => {
  plans._internal._reset();
  let world = { pro: false, counts: { voice_mock: 0 }, credits: { voice_mock: 3 } };
  let s = stub(world);
  try {
    await plans.recordUse(USER, 'voice_mock');
    assert.equal((world.debits || []).length, 0);
  } finally { s.restore(); }
  plans._internal._reset();
  world = { pro: false, counts: { voice_mock: 1 }, credits: {} };
  s = stub(world);
  try {
    const q = await plans.checkQuota(USER, 'voice_mock');
    assert.equal(q.ok, false);
    assert.equal(q.credits, 0);
  } finally { s.restore(); }
});
