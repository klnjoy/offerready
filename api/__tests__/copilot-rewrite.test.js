/**
 * AI Coach rewrite (POST /api/ai, action "copilot"): when the first answer uses filler
 * ("seamless", "operational efficiency"...) or a system question comes back without its
 * intro and diagram, api/ai.js asks the model once more and keeps the better answer.
 * node --test, global fetch stubbed.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const ENV = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', OPENAI_API_KEY: 'sk-test' };
const realFetch = global.fetch;
test.afterEach(() => { global.fetch = realFetch; });

function withEnv(env, fn) {
  const saved = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; process.env[k] = env[k]; }
  return Promise.resolve().then(fn).finally(() => { for (const k of Object.keys(saved)) { if (saved[k] == null) delete process.env[k]; else process.env[k] = saved[k]; } });
}
function mockRes() {
  return { statusCode: 0, headers: {}, body: '', status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; }, end(b) { if (b !== undefined) this.body += b; }, json() { return JSON.parse(this.body || 'null'); } };
}
const answer = (improved) => JSON.stringify({
  question_type: 'technical', headline: 'Move the tables with dbt and Airflow',
  outline: [{ point: 'Run old and new side by side', source: 'general', quote: '' }],
  improved_answer: improved, short_answer: improved.slice(0, 120), key_points: ['Parallel run', 'Cutover check', 'Rollback plan'],
  expert: { summary: 'Run both pipelines and compare row counts before cutover.', points: ['dbt tests', 'Airflow backfill'] },
});

async function ask(replies) {
  const ai = require('../ai');
  let calls = 0; const sent = [];
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, status: 200, json: async () => ({ id: 'u1', email: 'u@x.com' }) };
    if (u.includes('api.openai.com')) {
      sent.push(JSON.parse(opts.body).messages[1].content);
      const content = replies[Math.min(calls++, replies.length - 1)];
      return { ok: true, status: 200, json: async () => ({ model: 'gpt-4o-mini', choices: [{ message: { content } }] }) };
    }
    return { ok: true, status: 200, json: async () => [] };
  };
  let out;
  await withEnv(ENV, async () => {
    const res = mockRes();
    await ai({ method: 'POST', headers: { authorization: 'Bearer tok' }, body: { action: 'copilot', mode: 'answer', question: 'How do you migrate a warehouse?', resume: '', stories: [] } }, res);
    out = { status: res.statusCode, body: res.json() };
  });
  return { out, calls, sent };
}

test('an answer with filler is asked for once more, and the cleaner one is kept', async () => {
  const dirty = answer('I ran a seamless, meticulous migration that set a new standard for operational efficiency.');
  const clean = answer('I would run the old and new pipelines side by side with dbt tests, then cut over once row counts match.');
  const { out, calls, sent } = await ask([dirty, clean]);
  assert.equal(out.status, 200);
  assert.equal(calls, 2);
  assert.match(sent[1], /used filler \(.*seamless/);
  assert.match(out.body.result.improved_answer, /side by side/);
});

test('a clean answer is not asked for twice', async () => {
  const clean = answer('I would run the old and new pipelines side by side with dbt tests, then cut over once row counts match.');
  const { out, calls } = await ask([clean]);
  assert.equal(out.status, 200);
  assert.equal(calls, 1);
});

test('if the rewrite is no better, the first answer is kept', async () => {
  const dirty = answer('I ran a seamless migration.');
  const { out, calls } = await ask([dirty, dirty]);
  assert.equal(calls, 2);
  assert.match(out.body.result.improved_answer, /seamless/);
});
