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

test('a first set is 10 questions for this job, each tied to the job description', () => {
  const p = r.QUESTIONS_SYSTEM_PROMPT || r._internal.QUESTIONS_SYSTEM_PROMPT;
  assert.match(p, /Required counts: 4 technical, 3 behavioral, 2 system_design, 1 leadership\./);
  assert.match(p, /QUALITY OVER COUNT/);
  assert.match(p, /If you cannot point to it in\n  the job description, do not ask it/);
  const v = (r.validateQuestions || r._internal.validateQuestions);
  const mk = (c, n) => Array.from({ length: n }, (_, i) => ({ category: c, prompt: c + ' ' + i }));
  // 7 of 10 with every category represented is enough; 5 is not.
  assert.ok(v({ questions: [...mk('technical', 3), ...mk('behavioral', 2), ...mk('system_design', 1), ...mk('leadership', 1)] }).ok);
  assert.ok(!v({ questions: [...mk('technical', 2), ...mk('behavioral', 1), ...mk('system_design', 1), ...mk('leadership', 1)] }).ok);
});
