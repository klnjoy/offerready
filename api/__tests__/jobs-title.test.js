/**
 * Tests for deriveJobTitle / cleanTitle (api/_lib/jobs.js).
 * Uses Node's built-in test runner (node --test) — no external dependencies.
 *
 * These lock in the Save Job -> Check My Fit title fix: a saved job must get a
 * meaningful title following the spec priority (explicit -> analysis seniority
 * -> role-summary clause -> 'Untitled role') and must NEVER be stored as a
 * placeholder like "Not specified".
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { deriveJobTitle, cleanTitle } = require('../_lib/jobs');

test('cleanTitle: trims and keeps a real title', () => {
  assert.equal(cleanTitle('  Senior AI Engineer  '), 'Senior AI Engineer');
});

test('cleanTitle: treats placeholders/junk as empty (case-insensitive)', () => {
  ['', '   ', 'Not specified', 'NOT SPECIFIED', 'unspecified', 'N/A', 'na',
    'none', 'Unknown', 'Untitled'].forEach(function (v) {
    assert.equal(cleanTitle(v), '', 'expected junk -> "" for: ' + JSON.stringify(v));
  });
});

test('deriveJobTitle (a): explicit body.title wins over everything', () => {
  const t = deriveJobTitle(
    { title: 'Staff ML Engineer', targetRole: 'ML Eng' },
    { seniority: 'Senior', roleSummary: 'Builds platforms.' }
  );
  assert.equal(t, 'Staff ML Engineer');
});

test('deriveJobTitle (a): body.targetRole used when title absent', () => {
  const t = deriveJobTitle(
    { targetRole: 'Snowflake Data Architect' },
    { seniority: 'Senior', roleSummary: 'Owns the warehouse.' }
  );
  assert.equal(t, 'Snowflake Data Architect');
});

test('deriveJobTitle (b): falls back to analysis.seniority when it is real', () => {
  const t = deriveJobTitle({}, { seniority: 'Principal Engineer', roleSummary: 'Leads design.' });
  assert.equal(t, 'Principal Engineer');
});

test('deriveJobTitle (c): skips "Not specified" seniority -> role-summary clause', () => {
  const t = deriveJobTitle(
    {},
    { seniority: 'Not specified', roleSummary: 'Senior AI Engineer who builds RAG systems on AWS Bedrock.' }
  );
  assert.equal(t, 'Senior AI Engineer who builds RAG systems on AWS Bedrock');
});

test('deriveJobTitle (c): role-summary clause is cut at the first boundary', () => {
  const t = deriveJobTitle(
    { title: 'Not specified' },
    { seniority: 'unspecified', roleSummary: 'Data Platform Lead — owns ETL and BI pipelines.' }
  );
  assert.equal(t, 'Data Platform Lead');
});

test('deriveJobTitle (d): all-junk input falls back to "Untitled role"', () => {
  const t = deriveJobTitle(
    { title: 'Not specified', targetRole: 'n/a' },
    { seniority: 'unknown', roleSummary: 'none' }
  );
  assert.equal(t, 'Untitled role');
});

test('deriveJobTitle: never returns the placeholder "Not specified"', () => {
  const cases = [
    [{ title: 'Not specified' }, { seniority: 'Not specified', roleSummary: 'Not specified' }],
    [{}, { seniority: 'Not specified' }],
    [{ targetRole: 'Not specified' }, {}],
    [{}, {}],
    [null, null],
  ];
  cases.forEach(function (c) {
    const t = deriveJobTitle(c[0], c[1]);
    assert.notEqual((t || '').toLowerCase(), 'not specified');
    assert.ok(t && t.length > 0, 'title should be non-empty');
  });
});

test('deriveJobTitle: title is capped (never an unbounded paragraph)', () => {
  const long = 'A'.repeat(500);
  const t = deriveJobTitle({ title: long }, {});
  assert.ok(t.length <= 200, 'explicit title capped to 200');
});
