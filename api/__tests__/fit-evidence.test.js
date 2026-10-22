'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { normalizeRequirements, quoteInResume } = require('../_lib/fitEvidence');
const { validateGap } = require('../_lib/readinessAi');

const RESUME = [
  'Senior Data Engineer, Acme Corp (2019–2024)',
  '- Built ELT pipelines on Snowflake and dbt serving 40 analysts.',
  '- Led migration from Redshift to Snowflake, cutting warehouse cost by 30%.',
  '- Mentored 3 junior engineers.',
].join('\n');

test('quoteInResume: exact and lightly varied quotes count; invented ones do not', () => {
  assert.equal(quoteInResume('Built ELT pipelines on Snowflake and dbt serving 40 analysts', RESUME), true);
  assert.equal(quoteInResume('"Led migration from Redshift to Snowflake, cutting warehouse cost by 30%."', RESUME), true);
  assert.equal(quoteInResume('Built ELT pipelines on Snowflake dbt serving 40 analysts', RESUME), true); // one word dropped
  assert.equal(quoteInResume('Built streaming pipelines on Kafka serving 400 analysts', RESUME), false);
  assert.equal(quoteInResume('Snowflake and dbt', RESUME), true);
  assert.equal(quoteInResume('dbt', RESUME), false); // too short to count
  assert.equal(quoteInResume('Built ELT pipelines', ''), false); // no resume text
});

test('normalizeRequirements: verified quotes stay; unverifiable support becomes unverified', () => {
  const rows = normalizeRequirements([
    { requirement: 'Snowflake data modeling', importance: 'essential', status: 'supported', evidence: 'Built ELT pipelines on Snowflake and dbt serving 40 analysts.', why: 'Shows Snowflake + dbt at scale.', next: 'Add a modeling example.' },
    { requirement: 'Kafka streaming', importance: 'essential', status: 'supported', evidence: 'Designed Kafka streaming platform for 1M events per second', why: 'Kafka at scale.', next: '' },
    { requirement: 'Airflow', importance: 'preferred', status: 'missing', evidence: 'anything', why: 'Not in resume.', next: 'Learn Airflow basics.' },
    { requirement: 'Team leadership', importance: 'nice', status: 'partial', evidence: 'Mentored 3 junior engineers.', why: 'Mentoring, not managing.', next: 'Prepare a leadership story.' },
  ], RESUME);
  assert.deepEqual(rows.map((r) => [r.requirement, r.importance, r.status]), [
    ['Snowflake data modeling', 'essential', 'supported'],
    ['Kafka streaming', 'essential', 'unverified'],
    ['Team leadership', 'essential', 'partial'], // unknown importance -> essential
    ['Airflow', 'preferred', 'missing'],
  ]);
  const kafka = rows.find((r) => r.requirement === 'Kafka streaming');
  assert.equal(kafka.evidence, '');
  assert.equal(kafka.why, ''); // the uncheckable reason is dropped too
  assert.equal(rows.find((r) => r.requirement === 'Airflow').evidence, '');
  assert.equal(rows[0].evidence, 'Built ELT pipelines on Snowflake and dbt serving 40 analysts.');
});

test('normalizeRequirements: junk, duplicates and caps', () => {
  assert.deepEqual(normalizeRequirements(null, RESUME), []);
  const many = Array.from({ length: 30 }, (_, i) => ({ requirement: 'Skill ' + i, status: 'missing' }));
  assert.equal(normalizeRequirements(many, RESUME).length, 14);
  const dup = normalizeRequirements([{ requirement: 'SQL', status: 'missing' }, { requirement: 'sql', status: 'missing' }, 'x', { requirement: '' }], RESUME);
  assert.equal(dup.length, 1);
  assert.equal(dup[0].status, 'missing');
});

test('validateGap: requirements are verified against the resume passed in', () => {
  const parsed = { matchScore: 60, requirements: [{ requirement: 'Snowflake', importance: 'essential', status: 'supported', evidence: 'Led migration from Redshift to Snowflake', why: 'Migration.', next: '' }] };
  assert.equal(validateGap(parsed, RESUME).result.requirements[0].status, 'supported');
  assert.equal(validateGap(parsed, '').result.requirements[0].status, 'unverified');
  assert.deepEqual(validateGap({ matchScore: 10 }).result.requirements, []);
});
