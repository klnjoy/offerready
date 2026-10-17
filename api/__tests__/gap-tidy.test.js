'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { validateGap } = require('../_lib/readinessAi');

test('gap items lose filler and read as short labels', () => {
  const r = validateGap({
    matchScore: 70,
    strengths: ['Hands-on experience with Generative AI and OpenAI API'],
    missingSkills: ['Experience managing C-level relationships', 'Specific experience with systems integrators'],
    missingExperience: ['Proven track record of leading complex projects.'],
    missingKeywords: ['technical thought partner'],
  });
  assert.deepStrictEqual(r.result.strengths, ['Generative AI and OpenAI API']);
  assert.deepStrictEqual(r.result.missingSkills, ['Managing C-level relationships', 'Systems integrators']);
  assert.deepStrictEqual(r.result.missingExperience, ['Leading complex projects']);
  assert.deepStrictEqual(r.result.missingKeywords, ['technical thought partner']);
});

test('the same idea is not repeated across lists', () => {
  const r = validateGap({ matchScore: 50, strengths: ['Python'], missingSkills: ['Strong Python', 'Kafka'] });
  assert.deepStrictEqual(r.result.missingSkills, ['Kafka']);
});
