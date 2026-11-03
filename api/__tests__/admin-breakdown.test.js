'use strict';
const test = require('node:test');
const assert = require('node:assert');
const plan = require('../me/plan.js');

test('source buckets: LinkedIn, Search, Direct, Other', () => {
  const b = plan._sourceBucket;
  assert.strictEqual(b({ ref: 'linkedin.com' }), 'LinkedIn');
  assert.strictEqual(b({ ref: 'lnkd.in' }), 'LinkedIn');
  assert.strictEqual(b({ src: 'linkedin', ref: 'direct' }), 'LinkedIn');
  assert.strictEqual(b({ ref: 'google.com' }), 'Search');
  assert.strictEqual(b({ ref: 'duckduckgo.com' }), 'Search');
  assert.strictEqual(b({ ref: 'direct' }), 'Direct');
  assert.strictEqual(b({}), 'Direct');
  assert.strictEqual(b({ ref: 'news.ycombinator.com' }), 'Other: news.ycombinator.com');
  assert.strictEqual(b({ src: 'newsletter' }), 'Other: newsletter');
});
