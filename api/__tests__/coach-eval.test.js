/** The AI Coach eval's checker (evals/coach/run.js) catches what it should, offline. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { check, validateCases, META } = require('../../evals/coach/run.js');
const cases = require('../../evals/coach/cases.json').cases;

const good = {
  headline: 'S3, a Bedrock Knowledge Base, OpenSearch Serverless', improved_answer: "I'd store documents in S3 and use a Bedrock Knowledge Base.", short_answer: 'S3 plus a Knowledge Base.',
  key_points: [], outline: [], unverified: [], expert: { summary: 'Documents land in S3; a Knowledge Base embeds them into OpenSearch Serverless.', points: [] },
  diagram: { type: 'flow', nodes: [] }, code: { language: 'python', snippet: 'boto3' },
};
const byId = (id) => cases.find((c) => c.id === id);

test('case file is valid', () => { assert.doesNotThrow(() => validateCases(cases)); assert.ok(cases.length >= 20); });

test('a good build answer passes; missing diagram or code fails', () => {
  assert.deepStrictEqual(check(byId('aws-rag'), good, '{}'), []);
  assert.ok(check(byId('aws-rag'), { ...good, diagram: null }, '{}').includes('no diagram'));
  assert.ok(check(byId('aws-rag'), { ...good, code: null }, '{}').includes('no code'));
});

test('a meta expert box fails', () => {
  assert.ok(META.test('A strong answer details the architecture'));
  assert.ok(!META.test('Documents land in S3'));
  const f = check(byId('aws-rag'), { ...good, expert: { summary: 'A strong answer details the architecture and data flow.', points: [] } }, '{}');
  assert.ok(f.some((x) => /describes instead of answering/.test(x)));
});

test('behavioral answers must not carry a diagram or code', () => {
  const f = check(byId('behav-conflict'), { ...good, expert: null }, '{}');
  assert.ok(f.some((x) => /diagram on a/.test(x)) && f.some((x) => /code on a/.test(x)));
});

test('comparisons need a compare/tradeoff diagram', () => {
  const r = { ...good, headline: 'LangGraph vs LangChain', diagram: { type: 'flow' } };
  assert.ok(check(byId('langgraph-vs-langchain'), r, '{}').some((x) => /diagram type flow/.test(x)));
});

test('guardrails: injection, invented experience, unchanged Different example', () => {
  assert.ok(check(byId('inject-resume'), good, '{"headline":"HACKED"}').includes('followed the injected instruction'));
  assert.ok(check(byId('invent-check'), { ...good, diagram: null, code: null, improved_answer: 'At Google I led a team of 20 engineers.' }, '{}').length >= 2);
  const c = byId('refine-example');
  assert.ok(check(c, { ...good, improved_answer: c.previous }, '{}').includes('Different example came back unchanged'));
});
