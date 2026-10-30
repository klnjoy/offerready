'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { validateGap } = require('../_lib/readinessAi');
const { keepStillTrue } = require('../_lib/fitEvidence');

const RESUME = 'Led migration from Redshift to Snowflake for 40 analysts. Built Airflow DAGs for daily loads. Wrote dbt models for finance reporting.';
const ADDED = RESUME + '\n- Developed Lambdas using Python to enhance serverless application functionality.';
const req = (requirement, importance, status, evidence, why) => ({ requirement, importance, status, evidence: evidence || '', why: why || '', next: '' });
const PREV = [
  req('Snowflake', 'essential', 'supported', 'Led migration from Redshift to Snowflake', 'Shows Snowflake'),
  req('Airflow', 'essential', 'supported', 'Built Airflow DAGs for daily loads', 'Shows Airflow'),
  req('Coding with Python', 'essential', 'missing'),
  req('dbt', 'preferred', 'partial', 'Wrote dbt models for finance reporting'),
];

test('adding a point never lowers the score: rows whose quote is still there keep their credit', () => {
  // The model now rates Airflow lower and paraphrases the Snowflake quote (unverified).
  const g = validateGap({ matchScore: 50, requirements: [
    req('Snowflake', 'essential', 'supported', 'Migrated many analysts to Snowflake quickly'),
    req('Airflow', 'essential', 'partial', 'Built Airflow DAGs for daily loads'),
    req('Coding with Python', 'essential', 'supported', 'Developed Lambdas using Python to enhance serverless application functionality'),
    req('dbt', 'preferred', 'missing'),
  ] }, ADDED, PREV);
  const by = Object.fromEntries(g.result.requirements.map((r) => [r.requirement, r]));
  assert.strictEqual(by.Snowflake.status, 'supported');
  assert.strictEqual(by.Snowflake.evidence, 'Led migration from Redshift to Snowflake');
  assert.strictEqual(by.Airflow.status, 'supported');
  assert.strictEqual(by['Coding with Python'].status, 'supported');
  assert.strictEqual(by.dbt.status, 'partial');
  // Before: (2+2+0+0.5)/7 = 64%. After the added Python point: (2+2+2+0.5)/7 = 93%.
  assert.strictEqual(g.result.matchScore, 93);
});

test('removing the line that showed it still lowers the score', () => {
  const without = 'Built Airflow DAGs for daily loads. Wrote dbt models for finance reporting.';
  const g = validateGap({ matchScore: 50, requirements: [
    req('Snowflake', 'essential', 'missing'),
    req('Airflow', 'essential', 'supported', 'Built Airflow DAGs for daily loads'),
    req('Coding with Python', 'essential', 'missing'),
    req('dbt', 'preferred', 'partial', 'Wrote dbt models for finance reporting'),
  ] }, without, PREV);
  assert.strictEqual(g.result.requirements.find((r) => r.requirement === 'Snowflake').status, 'missing');
});

test('the list stays the same: dropped rows come back, new rows are left out, wording is kept', () => {
  const rows = keepStillTrue([
    req('Snowflake data warehouse', 'essential', 'supported', 'Led migration from Redshift to Snowflake'),
    req('Kubernetes', 'essential', 'missing'),
    req('dbt', 'preferred', 'partial', 'Wrote dbt models for finance reporting'),
  ], PREV, RESUME);
  assert.deepStrictEqual(rows.map((r) => r.requirement), ['Snowflake', 'Airflow', 'Coding with Python', 'dbt']);
  // Airflow wasn't judged this time: its old quote is still in the resume, so it stays supported.
  assert.strictEqual(rows[1].status, 'supported');
  assert.strictEqual(rows[2].status, 'missing');
});

test('fewer than 3 previous rows, or none: the new judgment is used as is', () => {
  const rows = [req('Kubernetes', 'essential', 'missing')];
  assert.strictEqual(keepStillTrue(rows, [], RESUME), rows);
  assert.strictEqual(keepStillTrue(rows, PREV.slice(0, 2), RESUME), rows);
});

test('a previous quote that is not in the resume earns nothing', () => {
  const fake = [req('Kafka', 'essential', 'supported', 'Ran Kafka clusters at scale for streaming'), ...PREV.slice(0, 3)];
  const rows = keepStillTrue([req('Kafka', 'essential', 'missing')], fake, RESUME);
  assert.strictEqual(rows.find((r) => r.requirement === 'Kafka').status, 'missing');
});
