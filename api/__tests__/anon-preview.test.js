/**
 * analyze_jd before sign-in: a free preview when take_anon_preview (migration
 * 0026) says yes; otherwise the usual "sign in" 401. The network is sent only
 * as a one-way hash, never the IP. Global fetch stubbed; node --test.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const ai = require('../ai');
const plans = require('../_lib/plans');

const ENV_KEYS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'ANON_PREVIEW_SALT', 'ANON_PREVIEWS_PER_NETWORK', 'ANON_PREVIEWS_PER_DAY'];
const realFetch = global.fetch;
const realRecord = plans.recordUse;
let saved;
test.beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
  process.env.OPENAI_API_KEY = 'sk-test';
  delete process.env.OPENAI_MODEL; delete process.env.ANON_PREVIEW_SALT;
  delete process.env.ANON_PREVIEWS_PER_NETWORK; delete process.env.ANON_PREVIEWS_PER_DAY;
});
test.afterEach(() => {
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  global.fetch = realFetch;
  plans.recordUse = realRecord;
});

function mockRes() {
  return {
    statusCode: 0, headers: {}, body: '',
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
    end(b) { if (b !== undefined) this.body += b; this.ended = true; },
    json() { return JSON.parse(this.body || 'null'); },
  };
}
const JD = 'Senior Data Engineer at Acme. Build batch and streaming pipelines on Snowflake and dbt; own data quality. 5+ years SQL and Python.';
const req = (ip) => ({ method: 'POST', headers: { origin: 'https://getofferready.app', 'x-forwarded-for': ip }, body: { action: 'analyze_jd', jobDescription: JD } });
const MODEL = JSON.stringify({ jobTitle: 'Senior Data Engineer', roleSummary: 'Builds pipelines.', coreSkills: ['SQL', 'Snowflake'], technologies: ['dbt'], preparationPlan: [] });

function stub(rpc) {
  const log = { rpc: [], openai: 0 };
  global.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('/rpc/take_anon_preview')) { log.rpc.push(JSON.parse(init.body)); return rpc(); }
    if (u.includes('api.openai.com')) { log.openai++; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: MODEL } }], usage: {} }) }; }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  return log;
}
const yes = () => ({ ok: true, status: 200, json: async () => true });

test('a visitor gets a free preview when the daily count allows it; only a hash of the network is sent', async () => {
  let recorded = 0;
  plans.recordUse = async () => { recorded++; };
  const log = stub(yes);
  const res = mockRes();
  await ai(req('203.0.113.7'), res);
  assert.equal(res.statusCode, 200, res.body);
  const out = res.json();
  assert.equal(out.preview, true);
  assert.ok(out.analysis);
  assert.equal(log.openai, 1);
  assert.equal(log.rpc.length, 1);
  assert.match(log.rpc[0].p_key, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(log.rpc[0]).includes('203.0.113.7'), 'the IP itself is never sent');
  assert.deepEqual([log.rpc[0].p_per_key, log.rpc[0].p_per_day], [2, 300]);
  assert.equal(recorded, 0, 'a preview counts toward no account');
});

test('over the daily count, or before migration 0026, it asks for sign-in and spends nothing', async () => {
  for (const rpc of [() => ({ ok: true, status: 200, json: async () => false }), () => ({ ok: false, status: 404, json: async () => ({ code: 'PGRST202' }) })]) {
    const log = stub(rpc);
    const res = mockRes();
    await ai(req('203.0.113.' + (10 + log.rpc.length + Math.floor(Math.random() * 200))), res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().signin, true);
    assert.equal(log.openai, 0);
  }
});

test('without the service key it asks for sign-in and never calls the model', async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const log = stub(yes);
  const res = mockRes();
  await ai(req('198.51.100.4'), res);
  assert.equal(res.statusCode, 401);
  assert.equal(log.rpc.length, 0);
  assert.equal(log.openai, 0);
});
