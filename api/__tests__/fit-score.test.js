'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { validateGap, requirementScore, buildGapUserMessage } = require('../_lib/readinessAi');

const RESUME = 'Led migration from Redshift to Snowflake for 40 analysts. Built Airflow DAGs for daily loads. Wrote dbt models for finance reporting.';
const req = (requirement, importance, status, evidence) => ({ requirement, importance, status, evidence: evidence || '', why: '', next: '' });

test('match score comes from the requirement rows, essential counting double', () => {
  assert.strictEqual(requirementScore([req('a', 'essential', 'supported'), req('b', 'essential', 'partial'), req('c', 'preferred', 'missing')]), 60);
  assert.strictEqual(requirementScore([req('a', 'essential', 'supported'), req('b', 'essential', 'supported'), req('c', 'preferred', 'supported')]), 100);
  assert.strictEqual(requirementScore([req('a', 'essential', 'unverified'), req('b', 'essential', 'missing'), req('c', 'preferred', 'missing')]), 0);
  assert.strictEqual(requirementScore([req('a', 'essential', 'supported')]), null);
});

test('validateGap replaces the model number with the rows score when there are enough rows', () => {
  const g = validateGap({ matchScore: 85, requirements: [
    req('Snowflake', 'essential', 'supported', 'Led migration from Redshift to Snowflake'),
    req('Airflow', 'essential', 'supported', 'Built Airflow DAGs for daily loads'),
    req('Kafka', 'essential', 'missing'),
    req('dbt', 'preferred', 'partial', 'Wrote dbt models for finance reporting'),
  ] }, RESUME);
  // (2+2+0+0.5) / 7 = 64%
  assert.strictEqual(g.result.matchScore, 64);
  // Too few rows: the model's number stays.
  assert.strictEqual(validateGap({ matchScore: 72, requirements: [req('Snowflake', 'essential', 'supported', 'Led migration from Redshift to Snowflake')] }, RESUME).result.matchScore, 72);
});

test('an unverifiable quote earns no credit', () => {
  const g = validateGap({ matchScore: 90, requirements: [
    req('Snowflake', 'essential', 'supported', 'Led migration from Redshift to Snowflake'),
    req('Kafka', 'essential', 'supported', 'Ran Kafka clusters at scale for streaming'),
    req('Airflow', 'essential', 'supported', 'Built Airflow DAGs for daily loads'),
  ] }, RESUME);
  assert.strictEqual(g.result.requirements[1].status, 'unverified');
  assert.strictEqual(g.result.matchScore, 67);
});

test('a re-check sends the previous requirements so the same list is judged', () => {
  const prev = [req('Snowflake', 'essential', 'supported'), req('Kafka', 'essential', 'missing'), req('dbt', 'preferred', 'partial')];
  const m = buildGapUserMessage({ jobTitle: 'Data Engineer', jobDescription: 'x'.repeat(40), resumeText: RESUME, previousRequirements: prev });
  assert.ok(m.includes('RE-CHECK OF THE SAME JOB'));
  assert.ok(m.includes('"requirement":"Kafka","importance":"essential"'));
  assert.ok(!m.includes('"status"'));
  const first = buildGapUserMessage({ jobTitle: 'Data Engineer', jobDescription: 'x'.repeat(40), resumeText: RESUME });
  assert.ok(!first.includes('RE-CHECK'));
});
