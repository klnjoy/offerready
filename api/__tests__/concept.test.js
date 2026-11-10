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

test('SUBJECT FIRST: a question that names a technology carries its subject to the Coach', () => {
  assert.strictEqual(COPILOT.subjectOf("What's your experience with Informatica Intelligent Cloud Services?"), 'Informatica IICS');
  assert.strictEqual(COPILOT.subjectOf('How do you schedule IICS taskflows?'), 'Informatica IICS');
  assert.strictEqual(COPILOT.subjectOf('Tell me about a conflict with your manager.'), '');
  const msg = COPILOT.buildUserMessage({ question: "What's your experience with Informatica Intelligent Cloud Services?", resume: 'Snowflake migrations' });
  assert.match(msg, /SUBJECT OF THE QUESTION: Informatica IICS/);
  assert.match(COPILOT.SYSTEM_PROMPT, /SUBJECT FIRST/);
  assert.match(COPILOT.SYSTEM_PROMPT, /never fill an X answer with resume items about\n?\s*'?\s*\+?\s*'?OTHER tools|OTHER tools/);
});

test('a RAG question carries the RAG checklist (pipeline, chunking, overlap, vector DB, namespaces, similarity, metadata, re-ranking, hallucination, citations, architecture)', () => {
  const msg = COPILOT.buildUserMessage({ question: 'Walk me through the RAG project on your resume.', resume: 'Built a RAG assistant' });
  assert.match(msg, /SUBJECT OF THE QUESTION: RAG/);
  for (const w of ['preprocessing and chunking', 'chunk size and overlap', 'vector database', 'namespaces and collections', 'similarity search', 'metadata filtering', 're-ranking', 'hallucination control', 'citations and grounding', 'RAG as an architecture']) assert.ok(msg.includes(w), w);
  assert.strictEqual(COPILOT.subjectChecklist('Snowflake').length, 0);
});
