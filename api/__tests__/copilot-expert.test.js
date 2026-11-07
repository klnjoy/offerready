'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../_lib/copilot.js');

test('Coach returns expert guidance, cleaned, never required', () => {
  const base = { headline: 'Hybrid retrieval with reranking', outline: [{ point: 'Chunk and embed', source: 'general', quote: '' }] };
  const v = C.validateCopilot({ ...base, expert: { summary: '  Use hybrid   search. ', points: ['- Chunk by section', '2) Rerank top 50', '', 'Filter by metadata'] } }, { resume: '' });
  assert.deepStrictEqual(v.result.expert, { summary: 'Use hybrid search.', points: ['Chunk by section', 'Rerank top 50', 'Filter by metadata'] });
  assert.strictEqual(C.validateCopilot(base, { resume: '' }).result.expert, null);
});

test('prompt teaches the right answer and bans "still learning" filler', () => {
  assert.match(C.SYSTEM_PROMPT, /NOT limited to the resume/);
  assert.match(C.SYSTEM_PROMPT, /Never pad with "I'm still learning"/);
  assert.match(C.SYSTEM_PROMPT, /Never invent employers/);
});

test('coach prompt: diagram and code are required for how-to-build technical questions; expert says the substance', () => {
  const C = require('../_lib/copilot');
  assert.match(C.SYSTEM_PROMPT, /diagram is REQUIRED/);
  assert.match(C.SYSTEM_PROMPT, /"code": REQUIRED when the question is about building/);
  assert.match(C.SYSTEM_PROMPT, /null for behavioral,\n?.*leadership and purely conceptual/s);
  assert.match(C.SYSTEM_PROMPT, /NEVER describe what an answer "should"/);
  assert.match(C.SYSTEM_PROMPT, /No secrets, no keys/);
});
