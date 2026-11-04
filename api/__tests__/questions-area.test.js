'use strict';
const test = require('node:test');
const assert = require('node:assert');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
const { saveQuestions, getQuestions } = require('../_lib/readiness');

function mockFetch(handler) {
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body });
    return handler(String(url), opts, calls.length);
  };
  return calls;
}
const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => '' });
const bad = () => ({ ok: false, status: 400, json: async () => ({}), text: async () => 'column area does not exist' });

const Q = [{ category: 'technical', difficulty: 'medium', prompt: 'How would you design retrieval?', area: 'Retrieval and RAG', signals: ['chunking'] }];

test('saveQuestions stores the area of each question', async () => {
  const calls = mockFetch(() => ok([]));
  assert.strictEqual(await saveQuestions('u1', 'j1', Q), 1);
  const post = calls.find((c) => c.method === 'POST');
  assert.strictEqual(JSON.parse(post.body)[0].area, 'Retrieval and RAG');
});

test('saveQuestions still saves before the area column exists', async () => {
  const calls = mockFetch((url, opts) => {
    if (opts.method !== 'POST') return ok([]);
    return 'area' in JSON.parse(opts.body)[0] ? bad() : ok([]);
  });
  assert.strictEqual(await saveQuestions('u1', 'j1', Q), 1);
  const posts = calls.filter((c) => c.method === 'POST');
  assert.strictEqual(posts.length, 2);
  assert.ok(!('area' in JSON.parse(posts[1].body)[0]));
});

test('getQuestions reads area, and falls back without it', async () => {
  let calls = mockFetch(() => ok([{ prompt: 'p', area: 'Agents' }]));
  assert.strictEqual((await getQuestions('u1', 'j1'))[0].area, 'Agents');
  assert.match(calls[0].url, /,area$/);
  calls = mockFetch((url) => (/,area$/.test(url) ? bad() : ok([{ prompt: 'p' }])));
  assert.strictEqual((await getQuestions('u1', 'j1')).length, 1);
  assert.strictEqual(calls.length, 2);
});
