'use strict';
const test = require('node:test');
const assert = require('node:assert');
const handler = require('../me/plan.js');

function call(req) {
  return new Promise((resolve) => {
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; return this; },
      status(c) { this.statusCode = c; return this; }, end(b) { resolve({ status: this.statusCode, body: b ? JSON.parse(b) : null }); } };
    handler(Object.assign({ headers: {}, query: {} }, req), res);
  });
}

test('push-key: 503 until VAPID keys are set, then the public key', async () => {
  delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
  assert.strictEqual((await call({ method: 'GET', query: { op: 'push-key' } })).status, 503);
  process.env.VAPID_PUBLIC_KEY = 'BPub'; process.env.VAPID_PRIVATE_KEY = 'priv';
  const r = await call({ method: 'GET', query: { op: 'push-key' } });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.publicKey, 'BPub');
  delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
});

test('daily-push needs the cron secret', async () => {
  process.env.CRON_SECRET = 's3cret';
  assert.strictEqual((await call({ method: 'GET', query: { op: 'daily-push' } })).status, 401);
  assert.strictEqual((await call({ method: 'GET', query: { op: 'daily-push' }, headers: { authorization: 'Bearer nope' } })).status, 401);
  delete process.env.CRON_SECRET;
  assert.strictEqual((await call({ method: 'GET', query: { op: 'daily-push' }, headers: { authorization: 'Bearer undefined' } })).status, 401);
});

test('saving a subscription needs sign-in', async () => {
  const r = await call({ method: 'POST', query: { op: 'push' }, body: { subscription: { endpoint: 'https://push.example.com/abc123456' } } });
  assert.strictEqual(r.status, 401);
});
