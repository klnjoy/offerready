'use strict';
const test = require('node:test');
const assert = require('node:assert');

const SB = 'https://proj.supabase.co';
const USER = '33333333-3333-3333-3333-333333333333';
const DAY = 86400000;
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body });

function stub(world) {
  const orig = global.fetch; const calls = [];
  global.fetch = async (url, opts) => {
    const u = String(url); const o = opts || {}; calls.push(u);
    if (u.startsWith(SB + '/auth/v1/user')) return (o.headers && o.headers.Authorization) === 'Bearer good' ? json(200, { id: USER }) : json(401, {});
    if (u.startsWith(SB + '/rest/v1/progress_metrics')) return world.progress === 'error' ? json(500, {}) : json(200, world.progress || []);
    if (u.startsWith(SB + '/rest/v1/gap_analysis')) return json(200, world.gaps || []);
    if (u.startsWith(SB + '/rest/v1/jobs')) return json(200, []);
    throw new Error('unexpected ' + u);
  };
  return { calls, restore: () => { global.fetch = orig; } };
}
function fakeRes() {
  const r = { statusCode: 0, headers: {}, body: '' };
  r.status = (c) => { r.statusCode = c; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; return r; };
  r.end = (b) => { r.body = b || ''; return r; };
  r.json = () => JSON.parse(r.body);
  return r;
}

test.beforeEach(() => { process.env.SUPABASE_URL = SB; process.env.SUPABASE_ANON_KEY = 'anon'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'; });

test('readinessByJob: latest score per job, half the match when never practised, week-ago value', async () => {
  const { readinessByJob } = require('../_lib/readiness');
  const now = Date.parse('2026-10-09T12:00:00Z');
  const iso = (d) => new Date(now - d * DAY).toISOString();
  const s = stub({
    progress: [
      { job_id: 'a', overall_readiness: 72, questions_practiced: 6, recorded_at: iso(0) },
      { job_id: 'a', overall_readiness: 65, recorded_at: iso(3) },
      { job_id: 'a', overall_readiness: 40, recorded_at: iso(8) },
      { job_id: 'a', overall_readiness: 20, recorded_at: iso(20) },
    ],
    gaps: [{ job_id: 'a', match_score: 80, created_at: iso(9) }, { job_id: 'b', match_score: 61, created_at: iso(1) }],
  });
  try {
    const r = await readinessByJob(USER, now);
    assert.deepEqual(r.a, { score: 72, match: 80, practiced: 6, at: iso(0), week_ago: 40 });
    assert.deepEqual(r.b, { score: 31, match: 61, practiced: 0, at: iso(1), week_ago: null });
    assert.equal(r.c, undefined);
    assert.equal(s.calls.filter((u) => u.includes('/rest/v1/')).length, 2, 'two reads for all jobs');
  } finally { s.restore(); }
});

test('GET /api/jobs?view=readiness returns scores; storage error -> empty map', async () => {
  const handler = require('../jobs/index');
  let s = stub({ progress: [{ job_id: 'a', overall_readiness: 50, recorded_at: new Date().toISOString() }] });
  try {
    const res = fakeRes();
    await handler({ method: 'GET', url: '/api/jobs?view=readiness', query: { view: 'readiness' }, headers: { authorization: 'Bearer good', Authorization: 'Bearer good' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().scores.a.score, 50);
  } finally { s.restore(); }
  s = stub({ progress: 'error' });
  try {
    const res = fakeRes();
    await handler({ method: 'GET', url: '/api/jobs?view=readiness', query: { view: 'readiness' }, headers: { authorization: 'Bearer good', Authorization: 'Bearer good' } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().scores, {});
  } finally { s.restore(); }
});
