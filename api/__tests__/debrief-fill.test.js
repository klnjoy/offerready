'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { buildFillMessages, parseFill } = require('../_lib/debriefFill');

test('prompt forbids adding questions that were not mentioned', () => {
  const m = buildFillMessages('They asked about RAG and I struggled with evals', { title: 'AI Engineer' });
  assert.match(m[0].content, /ONLY questions the recap says were asked/);
  assert.match(m[1].content, /RECAP:\nThey asked about RAG/);
  assert.match(m[1].content, /Job: AI Engineer/);
});

test('parseFill keeps valid fields and drops bad values', () => {
  const f = parseFill(JSON.stringify({
    questions: [{ text: 'How would you evaluate a RAG system?', rating: 'bad', note: 'forgot faithfulness' }, { text: '', rating: 'good' }, { text: 'Tell me about a conflict', rating: 'great', note: '' }],
    feeling: 3, round: 'technical', notes: 'Team of 6',
  }));
  assert.deepStrictEqual(f, {
    questions: [{ text: 'How would you evaluate a RAG system?', rating: 'bad', note: 'forgot faithfulness' }, { text: 'Tell me about a conflict', rating: '', note: '' }],
    feeling: 3, round: 'technical', notes: 'Team of 6',
  });
});

test('parseFill rejects nonsense and empty output', () => {
  assert.strictEqual(parseFill('nope'), null);
  assert.strictEqual(parseFill('{"questions":[]}'), null);
  assert.strictEqual(parseFill('{"questions":[],"feeling":9,"round":"x","notes":"Recruiter call next week"}').feeling, 0);
});
