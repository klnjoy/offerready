'use strict';
const test = require('node:test');
const assert = require('node:assert');
const handler = require('../ask');

function fakeRes() {
  const r = { statusCode: 0, headers: {}, body: '' };
  r.status = (c) => { r.statusCode = c; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; return r; };
  r.end = (b) => { r.body = b || ''; return r; };
  return r;
}

test('GET /api/ask (and the /api/areas rewrite) returns the topic list', async () => {
  const res = fakeRes();
  await handler({ method: 'GET', headers: { origin: 'https://klnjoy.github.io' } }, res);
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.areas[0], 'all');
  assert.ok(body.areas.includes('rag'));
  assert.match(res.headers['access-control-allow-methods'], /GET/);
});
