'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { TYPE_KEYS, buildInterviewerMessages, parseInterviewer } = require('../_lib/interviewerQs');

test('five interviewer kinds', () => {
  assert.deepStrictEqual(TYPE_KEYS, ['recruiter', 'hiring_manager', 'peer', 'leader', 'business']);
});

test('prompt names the interviewer kind, title and job', () => {
  const m = buildInterviewerMessages('leader', '  Director of   Data ', { title: 'Lead Data Engineer', company: 'Acme', skills: ['dbt', 'Snowflake'] });
  const u = m[1].content;
  assert.match(u, /Senior leader/);
  assert.match(u, /Director of Data/);
  assert.match(u, /Lead Data Engineer at Acme/);
  assert.match(u, /dbt, Snowflake/);
});

test('unknown kind falls back to hiring manager', () => {
  assert.match(buildInterviewerMessages('nope', '', null)[1].content, /Hiring manager/);
});

test('parse keeps clean questions and drops short or repeated ones', () => {
  const raw = JSON.stringify({
    focus: 'Impact.',
    questions: [
      { text: 'How did your work change a business outcome?', why: 'impact', tip: 'Lead with the number' },
      { text: 'How did your work change a business outcome?', why: 'dup', tip: '' },
      { text: 'Why?', why: '', tip: '' },
      { text: 'Tell me about leading through a reorg.', why: 'change', tip: 'STAR' },
      { text: 'How do you set priorities across teams?', why: '', tip: '' },
    ],
  });
  const r = parseInterviewer(raw);
  assert.strictEqual(r.focus, 'Impact.');
  assert.strictEqual(r.questions.length, 3);
});

test('parse rejects junk and too few questions', () => {
  assert.strictEqual(parseInterviewer('not json'), null);
  assert.strictEqual(parseInterviewer(JSON.stringify({ questions: [{ text: 'Only one question here?' }] })), null);
  assert.ok(parseInterviewer('```json\n' + JSON.stringify({ questions: ['a', 'b', 'c'].map((x) => ({ text: 'Question number ' + x + ' here?' })) }) + '\n```'));
});
