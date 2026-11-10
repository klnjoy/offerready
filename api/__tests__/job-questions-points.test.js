'use strict';
const test = require('node:test');
const assert = require('node:assert');
const r = require('../_lib/readinessAi.js');

test('questions keep the area and turn points into signals', () => {
  const qs = [];
  const add = (category, n) => { for (let i = 0; i < n; i++) qs.push({ category, difficulty: 'medium', area: 'Retrieval and vector search', prompt: category + ' question ' + i, points: ['- Chunking and embeddings', '2. Hybrid search and reranking', '', 'Metadata filters'] }); };
  add('technical', 4); add('behavioral', 3); add('system_design', 2); add('leadership', 1);
  const v = (r.validateQuestions || r._internal.validateQuestions)({ questions: qs });
  assert.ok(v.ok);
  assert.strictEqual(v.questions[0].area, 'Retrieval and vector search');
  assert.deepStrictEqual(v.questions[0].signals, ['Chunking and embeddings', 'Hybrid search and reranking', 'Metadata filters']);
});

test('the prompt steers away from "describe your experience" questions and alternatives', () => {
  const p = r.QUESTIONS_SYSTEM_PROMPT || r._internal.QUESTIONS_SYSTEM_PROMPT;
  assert.match(p, /At most ONE technical question may be "describe your experience with/);
  assert.match(p, /"Java or Node\.js"/);
  assert.match(p, /general expert/);
});

test('a set is at most 10 questions for this job, fewer is fine, each tied to the job description', () => {
  const p = r.QUESTIONS_SYSTEM_PROMPT || r._internal.QUESTIONS_SYSTEM_PROMPT;
  assert.match(p, /At most: 4 technical, 3 behavioral, 2 system_design, 1 leadership \(10 in all\)\./);
  assert.match(p, /FEWER IS FINE/);
  assert.match(p, /Never pad the set/);
  assert.match(p, /QUALITY OVER COUNT/);
  assert.match(p, /If you cannot point to it in\n  the job description, do not ask it/);
  const v = (r.validateQuestions || r._internal.validateQuestions);
  const mk = (c, n) => Array.from({ length: n }, (_, i) => ({ category: c, prompt: c + ' ' + i }));
  // Fewer than 10 is fine: 6 real questions is a set; 3 is not; none technical is not.
  assert.ok(v({ questions: [...mk('technical', 3), ...mk('behavioral', 2), ...mk('system_design', 1)] }).ok);
  assert.ok(!v({ questions: [...mk('technical', 2), ...mk('behavioral', 1)] }).ok);
  assert.ok(!v({ questions: mk('behavioral', 6) }).ok);
  // Never more than 10, however many come back.
  const big = v({ questions: [...mk('technical', 9), ...mk('behavioral', 6), ...mk('system_design', 4), ...mk('leadership', 3)] });
  assert.ok(big.ok);
  assert.ok(big.questions.length <= 10);
});
