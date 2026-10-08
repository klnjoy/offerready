'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { suggestActions, ROUTES } = require('../_lib/helpActions');

const routes = (q, a, o) => suggestActions(q, a, o).map((x) => x.route);

test('resume / fit / match → Check my fit', () => {
  assert.deepEqual(suggestActions('How is my resume match calculated?', ''), [{ label: 'Check my fit', route: '/fit' }]);
  assert.ok(routes('Is my CV a good fit?', '').includes('/fit'));
});

test('analyze / job description / JD → /analyze', () => {
  assert.ok(routes('Where do I paste the JD?', '').includes('/analyze'));
  assert.ok(routes('Can you analyze this job description?', '').includes('/analyze'));
});

test('readiness / score / progress → /dashboard', () => {
  assert.deepEqual(routes('How do I see my progress?', ''), ['/dashboard']);
  assert.deepEqual(routes('What is the readiness number?', ''), ['/dashboard']);
});

test('practice and questions', () => {
  assert.deepEqual(routes('Give me interview questions for this job', ''), ['/questions', '/practice']);
  assert.deepEqual(routes('Where can I do flashcards?', ''), ['/practice']);
});

test('mock / simulator, scenario / defend / trade-off', () => {
  assert.deepEqual(routes('Can I do a mock interview?', ''), ['/simulator']);
  assert.ok(routes('How do I simulate a loop?', '').includes('/simulator'));
  assert.deepEqual(routes('How do I defend a trade-off?', ''), ['/defend']);
  assert.ok(routes('Show me a scenario', '').includes('/defend'));
});

test('pricing / upgrade / pro → /account', () => {
  assert.deepEqual(routes('What does Pro cost? Is there pricing?', ''), ['/account']);
  assert.deepEqual(routes('How do I upgrade?', ''), ['/account']);
});

test('max 2, deduped, question beats answer', () => {
  const r = suggestActions('resume fit match', 'Run Check my fit, then a mock interview, then defend a scenario, then see your readiness score.');
  assert.equal(r.length, 2);
  assert.equal(r[0].route, '/fit');
  assert.equal(new Set(r.map((x) => x.route)).size, r.length);
});

test('falls back to answer keywords; nothing for unrelated text', () => {
  assert.deepEqual(routes('What should I do next?', 'Start with a mock interview.'), ['/simulator']);
  assert.deepEqual(suggestActions('What is a transformer?', 'Attention lets tokens look at each other.'), []);
  assert.deepEqual(suggestActions(null, undefined), []);
});

test('skips the route the user is already on', () => {
  assert.deepEqual(routes('How is my resume match calculated?', '', { currentPath: '/fit' }), []);
  assert.deepEqual(routes('How do I see my progress?', '', { currentPath: '/fit/' }), ['/dashboard']);
});

test('every route is a real app route', () => {
  const APP = ['/', '/analyze', '/jobs', '/fit', '/questions', '/defend', '/dashboard', '/practice', '/simulator', '/example', '/account'];
  for (const r of ROUTES) assert.ok(APP.includes(r), r);
});
