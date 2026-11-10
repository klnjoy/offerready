'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { conceptOf, PROMPT_RULES } = require('../_lib/concept');
const COPILOT = require('../_lib/copilot');
const GRADE = require('../_lib/gradeAnswer');

test('conceptOf keeps a full block and trims it', () => {
  const c = conceptOf({ name: '  RAG ', what: 'Look things up, then answer.', why: 'Models forget. Fetching sources keeps answers current.', rule: 'Use it for changing facts; skip it for pure reasoning.' });
  assert.deepStrictEqual(c, { name: 'RAG', what: 'Look things up, then answer.', why: 'Models forget. Fetching sources keeps answers current.', rule: 'Use it for changing facts; skip it for pure reasoning.' });
});

test('conceptOf drops a block missing any of its three parts', () => {
  assert.strictEqual(conceptOf(null), null);
  assert.strictEqual(conceptOf({ name: 'RAG', what: 'x', why: 'y' }), null);
  assert.strictEqual(conceptOf({ name: '', what: 'x', why: 'y', rule: 'z' }), null);
});

test('conceptOf caps each part so the block stays short', () => {
  const c = conceptOf({ name: 'n'.repeat(200), what: 'w'.repeat(999), why: 'y'.repeat(999), rule: 'r'.repeat(999) });
  assert.ok(c.name.length <= 80 && c.what.length <= 220 && c.why.length <= 420 && c.rule.length <= 300);
});

test('Coach and grading prompts ask for the concept block', () => {
  assert.ok(COPILOT.SYSTEM_PROMPT.includes(PROMPT_RULES));
  assert.ok(COPILOT.SYSTEM_PROMPT.includes('"concept"'));
  assert.ok(GRADE.SYSTEM_PROMPT.includes(PROMPT_RULES));
});

test('a Coach answer carries its concept through validation', () => {
  const v = COPILOT.validateCopilot({ headline: 'Lead with the eval set.', outline: [{ point: 'Measure first', source: 'general' }], improved_answer: 'I would build an eval set first.', short_answer: 'Eval set first.',
    concept: { name: 'Evaluation sets', what: 'A fixed list of questions with known good answers.', why: 'Without one you cannot tell if a change helped.', rule: 'Build one before tuning; skip it for one-off scripts.' } }, { question: 'q', resume: '', stories: [] });
  assert.ok(v.ok);
  assert.strictEqual(v.result.concept.name, 'Evaluation sets');
});
