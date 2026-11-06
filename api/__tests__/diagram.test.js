/**
 * Diagrams in answers (api/_lib/diagram.js): one diagram from the same content
 * as the answer, checked against it; never for behavioral answers.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { validateDiagram, PROMPT_RULES } = require('../_lib/diagram');
const COPILOT = require('../_lib/copilot');
const TOPIC_Q = require('../_lib/topicQuestions');

const TEXT = 'Put an API in front, push messages onto a queue, and let workers deliver to the provider with retry and backoff. After retries fail, move the message to a dead-letter queue. At-least-once delivery means a duplicate is possible, so make sends idempotent. Retry up to 5 times.';
const FLOW = { type: 'flow', caption: 'Messages go through a queue', nodes: [{ label: 'API' }, { label: 'Queue', key: true }, { label: 'Workers' }, { label: 'Provider' }], branches: [{ from: 2, edge: 'after retries fail', label: 'Dead-letter queue' }] };

test('flow: kept when every box is in the text; one key box; branches checked', () => {
  const d = validateDiagram({ ...FLOW, nodes: [...FLOW.nodes.slice(0, 3).map((n) => ({ ...n, key: true })), FLOW.nodes[3]] }, { text: TEXT, kind: 'system_design' });
  assert.equal(d.type, 'flow');
  assert.deepEqual(d.nodes.map((n) => n.label), ['API', 'Queue', 'Workers', 'Provider']);
  assert.equal(d.nodes.filter((n) => n.key).length, 1);
  assert.equal(d.branches[0].label, 'Dead-letter queue');
  const bad = validateDiagram({ ...FLOW, branches: [{ from: 9, label: 'Queue' }, { from: 1, label: '' }] }, { text: TEXT, kind: 'technical' });
  assert.deepEqual(bad.branches, []);
});

test('a box the text never mentions, or a number it never states, drops the diagram', () => {
  assert.equal(validateDiagram({ ...FLOW, nodes: [{ label: 'API' }, { label: 'Kafka' }, { label: 'Workers' }] }, { text: TEXT }), null);
  assert.equal(validateDiagram({ ...FLOW, branches: [{ from: 2, edge: 'after 3 retries', label: 'Dead-letter queue' }] }, { text: TEXT }), null);
  assert.ok(validateDiagram({ ...FLOW, branches: [{ from: 2, edge: 'after 5 retries', label: 'Dead-letter queue' }] }, { text: TEXT }));
});

test('never for behavioral or leadership answers; unknown types and thin diagrams are dropped', () => {
  assert.equal(validateDiagram(FLOW, { text: TEXT, kind: 'behavioral' }), null);
  assert.equal(validateDiagram(FLOW, { text: TEXT, kind: 'leadership' }), null);
  assert.equal(validateDiagram({ ...FLOW, type: 'pie' }, { text: TEXT }), null);
  assert.equal(validateDiagram({ type: 'flow', nodes: ['API', 'Queue'] }, { text: TEXT }), null);
  assert.equal(validateDiagram({ type: 'sequence', steps: ['Retry', 'Queue'] }, { text: TEXT }), null);
  assert.equal(validateDiagram(null, { text: TEXT }), null);
  assert.equal(validateDiagram(FLOW, { text: '' }), null);
});

test('sequence, tradeoff and compare are validated and clamped', () => {
  const seq = validateDiagram({ type: 'sequence', caption: 'Delivery', steps: ['API accepts the message', 'Queue holds it', 'Workers deliver with retry', 'Dead-letter queue after retries fail'] }, { text: TEXT });
  assert.equal(seq.steps.length, 4);
  const to = validateDiagram({ type: 'tradeoff', rows: [{ choice: 'At-least-once', gain: 'No lost messages', cost: 'A duplicate is possible' }, { choice: 'Exactly-once', gain: 'No duplicates', cost: 'Slower and harder' }, { choice: 'At-most-once', gain: 'x', cost: '' }] }, { text: TEXT + ' Exactly-once is slower.' });
  assert.deepEqual(to.rows.map((r) => r.choice), ['At-least-once', 'Exactly-once']);
  const cmp = validateDiagram({ type: 'compare', left: 'Retry', right: 'Dead-letter queue', rows: [{ axis: 'When', left: 'Each failure', right: 'After retries fail' }, { axis: 'Goal', left: 'Deliver', right: 'Keep for review' }] }, { text: TEXT });
  assert.equal(cmp.rows.length, 2);
  assert.equal(validateDiagram({ type: 'compare', left: 'Retry', right: 'Webhooks', rows: cmp.rows }, { text: TEXT }), null);
});

test('the Coach asks for one diagram from the same content, and validates it', () => {
  assert.match(COPILOT.SYSTEM_PROMPT, /"diagram"/);
  assert.match(PROMPT_RULES, /NEVER for behavioral/);
  const base = { headline: 'Queue the messages and retry with backoff.', outline: [{ point: 'Queue first', source: 'general' }], improved_answer: TEXT, short_answer: 'API, queue, workers, provider; dead-letter queue after retries fail.', key_points: ['Queue', 'Retry', 'Idempotent'] };
  const ok = COPILOT.validateCopilot({ ...base, question_type: 'system_design', diagram: FLOW }, {});
  assert.equal(ok.result.diagram.type, 'flow');
  const story = COPILOT.validateCopilot({ ...base, question_type: 'behavioral', diagram: FLOW }, {});
  assert.equal(story.result.diagram, null);
  const none = COPILOT.validateCopilot({ ...base, question_type: 'technical' }, {});
  assert.equal(none.result.diagram, null);
});

test('AI topic questions carry a checked diagram; story questions never do', () => {
  const v = TOPIC_Q.validate({ questions: [
    { q: 'How would you deliver notifications reliably when a provider is down?', a: TEXT, difficulty: 'hard', diagram: FLOW },
    { q: 'Tell me about a time a delivery system failed.', a: TEXT, diagram: FLOW },
    { q: 'What does idempotent mean for message sends?', a: TEXT, diagram: { ...FLOW, nodes: [{ label: 'Kafka' }, { label: 'Queue' }, { label: 'API' }] } },
  ] }, { topic: 'System design', avoid: [] });
  assert.equal(v.ok, true);
  assert.equal(v.questions[0].diagram.type, 'flow');
  assert.equal(v.questions[1].diagram, undefined);
  assert.equal(v.questions[2].diagram, undefined);
  assert.match(TOPIC_Q.SYSTEM_PROMPT, /"diagram"/);
});
