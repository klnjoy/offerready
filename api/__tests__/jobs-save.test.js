/**
 * Saving a job must not fail just because the model left roleSummary empty
 * ("A valid analysis is required to save a job" on an otherwise good analysis).
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
const { hasAnalysisContent, fallbackSummary } = require('../jobs/index.js')._test;

test('an analysis with skills but no summary can be saved', () => {
  assert.strictEqual(hasAnalysisContent({ roleSummary: '', coreSkills: ['SQL'] }), true);
  assert.strictEqual(hasAnalysisContent({ roleSummary: '  ', responsibilities: ['Own pipelines'] }), true);
  assert.strictEqual(hasAnalysisContent({ roleSummary: 'Builds pipelines.' }), true);
});

test('empty or wrong-shaped analyses are still refused', () => {
  assert.strictEqual(hasAnalysisContent(null), false);
  assert.strictEqual(hasAnalysisContent('text'), false);
  assert.strictEqual(hasAnalysisContent([]), false);
  assert.strictEqual(hasAnalysisContent({ roleSummary: '', coreSkills: [], technologies: [] }), false);
});

test('the fallback summary comes from the posting, else the title', () => {
  const jd = 'Senior Data Engineer.\n\nBuild   pipelines with Snowflake.';
  assert.strictEqual(fallbackSummary({ jobDescription: jd }, {}), 'Senior Data Engineer. Build pipelines with Snowflake.');
  const long = 'word '.repeat(200);
  const s = fallbackSummary({ jobDescription: long }, {});
  assert.ok(s.length <= 401 && s.endsWith('…'));
  assert.strictEqual(fallbackSummary({}, { jobTitle: 'Data Engineer' }), 'Data Engineer');
  assert.strictEqual(fallbackSummary({ title: 'FDE' }, {}), 'FDE');
  assert.strictEqual(fallbackSummary({}, {}), 'Saved job');
});
