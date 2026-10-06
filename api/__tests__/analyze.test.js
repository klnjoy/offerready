/**
 * Tests for the pure logic of the Analyze My Job MVP.
 * Uses Node's built-in test runner (node --test) — no external dependencies.
 * These cover input validation, malformed-LLM-JSON safety, normalization, and
 * skill->resource mapping. (The network OpenAI call is not unit-tested here;
 * it's exercised end-to-end after deploy per DEPLOY.md.)
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { validateInput, safeParseModelJson, normalizeAnalysis, LIMITS } = require('../_lib/validate');
const { lookupResource, mapSkillsToResources } = require('../_lib/skillMap');

test('validateInput: missing job description is rejected', () => {
  const r = validateInput({});
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test('validateInput: too-short JD is rejected', () => {
  const r = validateInput({ jobDescription: 'too short' });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test('validateInput: valid JD passes and trims', () => {
  const jd = 'We are hiring an AI engineer to build RAG systems on AWS Bedrock. '.repeat(2);
  const r = validateInput({ jobDescription: '  ' + jd + '  ', targetRole: 'AI Eng' });
  assert.equal(r.ok, true);
  assert.equal(r.value.jobDescription, jd.trim());
  assert.equal(r.value.targetRole, 'AI Eng');
});

test('validateInput: valid JD + resume passes', () => {
  const jd = 'Design production GenAI systems with RAG and agents on AWS.'.repeat(2);
  const r = validateInput({ jobDescription: jd, resume: 'Python, AWS, RAG experience.' });
  assert.equal(r.ok, true);
  assert.equal(r.value.resume, 'Python, AWS, RAG experience.');
});

test('validateInput: oversized JD is rejected (413)', () => {
  const r = validateInput({ jobDescription: 'x'.repeat(LIMITS.JD_MAX + 1) });
  assert.equal(r.ok, false);
  assert.equal(r.status, 413);
});

test('validateInput: oversized resume is rejected (413)', () => {
  const jd = 'Design production GenAI systems with RAG and agents on AWS.'.repeat(2);
  const r = validateInput({ jobDescription: jd, resume: 'x'.repeat(LIMITS.RESUME_MAX + 1) });
  assert.equal(r.ok, false);
  assert.equal(r.status, 413);
});

test('validateInput: non-object body is rejected', () => {
  const r = validateInput('not an object');
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test('safeParseModelJson: parses clean JSON', () => {
  const obj = safeParseModelJson('{"roleSummary":"x"}');
  assert.deepEqual(obj, { roleSummary: 'x' });
});

test('safeParseModelJson: parses fenced JSON', () => {
  const obj = safeParseModelJson('```json\n{"a":1}\n```');
  assert.deepEqual(obj, { a: 1 });
});

test('safeParseModelJson: extracts JSON embedded in prose', () => {
  const obj = safeParseModelJson('Here is the result: {"a":2} thanks!');
  assert.deepEqual(obj, { a: 2 });
});

test('safeParseModelJson: returns null on unparseable text (no crash)', () => {
  assert.equal(safeParseModelJson('totally not json'), null);
  assert.equal(safeParseModelJson(''), null);
  assert.equal(safeParseModelJson(null), null);
});

// Truncation recovery: a model response cut off at max_tokens produces a valid
// JSON PREFIX that none of the direct/fenced/outermost-brace attempts can parse.
// safeParseModelJson must repair it (close the open string + balance brackets)
// so a long analysis isn't lost to "The analysis could not be understood".
test('safeParseModelJson: recovers a truncated object (array cut mid-element)', () => {
  const truncated = '{"roleSummary":"Senior AI Engineer","coreSkills":["RAG","LangGraph","Age';
  const obj = safeParseModelJson(truncated);
  assert.ok(obj, 'should recover an object, not null');
  assert.equal(obj.roleSummary, 'Senior AI Engineer');
  assert.ok(Array.isArray(obj.coreSkills));
  // The complete elements survive; the dangling partial ("Age...) is dropped.
  assert.ok(obj.coreSkills.indexOf('RAG') !== -1);
  assert.ok(obj.coreSkills.indexOf('LangGraph') !== -1);
});

test('safeParseModelJson: recovers a truncated object cut after a comma', () => {
  const truncated = '{"a":1,"b":[1,2,3],';
  const obj = safeParseModelJson(truncated);
  assert.ok(obj, 'should recover an object');
  assert.equal(obj.a, 1);
  assert.deepEqual(obj.b, [1, 2, 3]);
});

test('safeParseModelJson: recovers a truncated nested object', () => {
  const truncated = '{"plan":[{"priority":1,"title":"Learn RAG"},{"priority":2,"title":"Mult';
  const obj = safeParseModelJson(truncated);
  assert.ok(obj, 'should recover an object');
  assert.ok(Array.isArray(obj.plan));
  assert.equal(obj.plan[0].title, 'Learn RAG');
});

test('normalizeAnalysis: fills defaults for a sparse/garbage object', () => {
  const a = normalizeAnalysis({ roleSummary: 'r' }, false);
  assert.equal(a.roleSummary, 'r');
  assert.deepEqual(a.coreSkills, []);
  assert.deepEqual(a.alignment, []); // no resume => alignment empty
  assert.equal(a.resumeProvided, false);
});

test('normalizeAnalysis: keeps alignment only when resume provided', () => {
  const withResume = normalizeAnalysis({ alignment: [{ requirement: 'x' }] }, true);
  assert.equal(withResume.alignment.length, 1);
  const noResume = normalizeAnalysis({ alignment: [{ requirement: 'x' }] }, false);
  assert.equal(noResume.alignment.length, 0);
});

test('skillMap: known skills map to real resource paths', () => {
  assert.equal(lookupResource('AWS Bedrock').path, 'GenAI-Topics/bedrock/index.html');
  assert.equal(lookupResource('RAG').path, 'GenAI-Topics/rag/index.html');
  assert.equal(lookupResource('System Design').path, 'Personal-SourceCode/Interview_Requirements_to_Production.html');
});

test('skillMap: unknown skill returns null', () => {
  assert.equal(lookupResource('underwater basket weaving'), null);
});

test('skillMap: mapSkillsToResources de-dupes', () => {
  const out = mapSkillsToResources(['RAG', 'rag pipelines', 'AWS Bedrock']);
  const paths = out.map((r) => r.path);
  assert.equal(new Set(paths).size, paths.length); // no duplicates
  assert.ok(paths.includes('GenAI-Topics/rag/index.html'));
});
