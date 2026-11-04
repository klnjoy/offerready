'use strict';
const test = require('node:test');
const assert = require('node:assert');
const r = require('../_lib/readinessAi.js');

test('questions keep the area and turn points into signals', () => {
  const qs = [];
  const add = (category, n) => { for (let i = 0; i < n; i++) qs.push({ category, difficulty: 'medium', area: 'Retrieval and vector search', prompt: category + ' question ' + i, points: ['- Chunking and embeddings', '2. Hybrid search and reranking', '', 'Metadata filters'] }); };
  add('technical', 6); add('behavioral', 5); add('system_design', 3); add('leadership', 2);
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
