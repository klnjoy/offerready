'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseBody, validateTurn, buildMessages, coverageList } = require('../premium/mock-turn.js')._internal;

const base = { turn_index: 1, question: 'How would you design a multi-agent workflow?', session_id: 'sess_abc123', transcript: 'Multi agent process' };
const model = {
  followup: 'Which agent owns the audit?',
  feedback: {
    scores: { structure: 2, depth: 1, relevance: 3, communication: 2 },
    strengths: ['Right direction'], improve: ['Name each agent'], strong_answer_outline: ['Orchestrator', 'State'],
    score10: 2,
    coverage: [{ point: 'Agent responsibilities', status: 'missing' }, { point: 'Human approval', status: 'PARTIAL' }, { point: 'Agent responsibilities', status: 'covered' }, { point: 'MCP', status: 'weird' }],
    improved_answer: '**I would** split the work.\n\n\n\nAn orchestrator keeps state.',
    honesty_note: 'Present this as a proposal.',
    memory_hook: 'Orchestrate -> Retrieve -> Audit => Report',
  },
};

test('coach-loop fields are validated and clamped', () => {
  const v = parseBody(base).value;
  const r = validateTurn(model, v);
  assert.ok(r.ok);
  const fb = r.value.feedback;
  assert.strictEqual(fb.score10, 2);
  assert.deepStrictEqual(fb.coverage, [
    { point: 'Agent responsibilities', status: 'missing' },
    { point: 'Human approval', status: 'partial' },
    { point: 'MCP', status: 'missing' },
  ]);
  assert.strictEqual(fb.improved_answer, 'I would split the work.\n\nAn orchestrator keeps state.');
  assert.strictEqual(fb.memory_hook, 'Orchestrate → Retrieve → Audit → Report');
  assert.strictEqual(r.value.followup, 'Which agent owns the audit?');
  assert.ok(!r.value.revealed);
});

test('score10 falls back to the four scores when missing', () => {
  const v = parseBody(base).value;
  const m = JSON.parse(JSON.stringify(model));
  delete m.feedback.score10;
  m.feedback.scores = { structure: 4, depth: 4, relevance: 5, communication: 3 };
  assert.strictEqual(validateTurn(m, v).value.feedback.score10, 8);
});

test('reveal: no grading, no follow-up, transcript dropped, model answer kept', () => {
  const v = parseBody({ ...base, reveal: true, transcript: 'ignore me' }).value;
  assert.strictEqual(v.transcript, '');
  assert.strictEqual(v.allowFollowup, false);
  const r = validateTurn(model, v);
  assert.strictEqual(r.value.revealed, true);
  assert.strictEqual(r.value.followup, undefined);
  assert.strictEqual(r.value.feedback.score10, 0);
  assert.deepStrictEqual(Object.values(r.value.feedback.scores), [1, 1, 1, 1]);
  assert.deepStrictEqual(r.value.feedback.strengths, []);
  assert.ok(r.value.feedback.coverage.every((c) => c.status === 'missing'));
  assert.ok(r.value.feedback.improved_answer.startsWith('I would'));
  assert.match(buildMessages(v)[1].content, /REVEAL/);
});

test('no answer and no reveal: no improved answer', () => {
  const v = parseBody({ ...base, transcript: '' }).value;
  assert.strictEqual(validateTurn(model, v).value.feedback.improved_answer, '');
});

test('prompt forbids inventing experience', () => {
  const v = parseBody(base).value;
  assert.match(buildMessages(v)[0].content, /NEVER invent experience/);
  assert.deepStrictEqual(coverageList('x'), []);
});
