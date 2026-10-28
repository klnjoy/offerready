/**
 * topic_questions (POST /api/ai, action "topic_questions"): five fresh
 * AI questions with answers on one bank topic. Sign-in required; questions
 * that repeat the bank are dropped; malformed output fails closed.
 * node --test, global fetch stubbed.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const T = require('../_lib/topicQuestions');

const ENV = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', OPENAI_API_KEY: 'sk-test' };
const realFetch = global.fetch;
test.afterEach(() => { global.fetch = realFetch; });

function withEnv(env, fn) {
  const saved = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; process.env[k] = env[k]; }
  return Promise.resolve().then(fn).finally(() => { for (const k of Object.keys(saved)) { if (saved[k] == null) delete process.env[k]; else process.env[k] = saved[k]; } });
}
function mockRes() {
  return {
    statusCode: 0, headers: {}, body: '',
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
    end(b) { if (b !== undefined) this.body += b; },
    json() { return JSON.parse(this.body || 'null'); },
  };
}
const QS = [
  { q: 'What is a vector database used for in RAG?', a: 'It stores embeddings and finds the nearest ones to a query embedding, so the app can retrieve relevant chunks.', difficulty: 'easy' },
  { q: 'How would you evaluate retrieval quality?', a: 'Build a labelled set of questions with the chunks that answer them, then measure recall@k and MRR; check answers with human or judged review.', difficulty: 'medium' },
  { q: 'Explain chunk size trade-offs.', a: 'Small chunks are precise but lose context; large chunks keep context but dilute similarity and cost more tokens. Tune on your eval set.', difficulty: 'medium' },
  { q: 'What is RAG?', a: 'Retrieval-augmented generation: retrieve documents, then generate with them in the prompt.', difficulty: 'easy' },
  { q: 'How do you defend a RAG app against prompt injection in documents?', a: 'Treat retrieved text as data, not instructions; fence it, limit tool permissions, and validate outputs before acting.', difficulty: 'hard' },
  { q: 'Extra sixth question that should be cut?', a: 'Only five are kept, so this one is dropped by the validator.', difficulty: 'hard' },
];

test('input: a topic is required; avoid list and title are trimmed and capped', () => {
  assert.strictEqual(T.readInput({}).ok, false);
  const r = T.readInput({ topic: '  RAG ', jobTitle: 'AI Engineer', avoid: ['What is RAG?', 5, ''] });
  assert.deepStrictEqual(r.input, { topic: 'RAG', jobTitle: 'AI Engineer', avoid: ['What is RAG?'] });
  const msg = T.buildUserMessage(r.input);
  assert.match(msg, /Topic: RAG/); assert.match(msg, /Job title: AI Engineer/); assert.match(msg, /Avoid/);
});

test('validator keeps five, drops repeats of the bank and malformed rows', () => {
  const input = T.readInput({ topic: 'RAG', avoid: ['What is RAG?'] }).input;
  const v = T.validate({ questions: [{ q: 'short', a: 'x' }, ...QS] }, input);
  assert.ok(v.ok);
  assert.strictEqual(v.questions.length, 5);
  assert.ok(!v.questions.some((q) => q.q === 'What is RAG?'), 'bank question not repeated');
  assert.ok(v.questions.every((q) => q.topic === 'RAG' && ['easy', 'medium', 'hard'].includes(q.difficulty)));
  assert.strictEqual(T.validate({ questions: QS.slice(0, 2) }, input).ok, false, 'fewer than 3 fails closed');
  assert.strictEqual(T.validate(null, input).ok, false);
});

test('signed out gets 401 and no AI call', async () => {
  const ai = require('../ai');
  let openai = 0;
  global.fetch = async (url) => { if (String(url).includes('openai')) openai++; return { ok: false, status: 401, json: async () => ({}) }; };
  await withEnv(ENV, async () => {
    const res = mockRes();
    await ai({ method: 'POST', headers: {}, body: { action: 'topic_questions', topic: 'RAG' } }, res);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.json().signin, true);
  });
  assert.strictEqual(openai, 0);
});

test('signed in gets questions; the bank list and job title reach the prompt', async () => {
  const ai = require('../ai');
  let sent = null;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, status: 200, json: async () => ({ id: 'u1', email: 'u@x.com' }) };
    if (u.includes('api.openai.com')) { sent = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({ model: 'gpt-4o-mini', choices: [{ message: { content: JSON.stringify({ questions: QS }) } }] }) }; }
    return { ok: true, status: 201, json: async () => [] };
  };
  await withEnv(ENV, async () => {
    const res = mockRes();
    await ai({ method: 'POST', headers: { authorization: 'Bearer tok' }, body: { action: 'topic_questions', topic: 'RAG', jobTitle: 'AI Engineer', avoid: ['What is RAG?'] } }, res);
    assert.strictEqual(res.statusCode, 200);
    const out = res.json();
    assert.strictEqual(out.topic, 'RAG');
    assert.strictEqual(out.questions.length, 5);
  });
  const user = sent.messages[1].content;
  assert.match(user, /Job title: AI Engineer/);
  assert.match(user, /What is RAG\?/);
});
