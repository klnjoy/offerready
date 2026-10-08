/**
 * Tests for api/_lib/rateLimit.js (in-memory token bucket) and its wiring into
 * api/ask.js and api/ai.js. node --test, no deps.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const rateLimit = require('../_lib/rateLimit');

function fakeRes() {
  const res = { statusCode: 0, headers: {}, body: '' };
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
  res.write = () => true;
  res.end = (b) => { res.body = b || ''; return res; };
  return res;
}
const req = (ip, extra) => ({ method: 'POST', headers: Object.assign({ origin: 'https://klnjoy.github.io', 'x-forwarded-for': ip }, extra || {}), body: {} });

test.beforeEach(() => rateLimit._internal._reset());

test('take: allows `cap` requests, then refuses with a retryAfter', () => {
  const t0 = 1000000;
  for (let i = 0; i < 20; i++) assert.equal(rateLimit.take('k', 20, t0).ok, true, 'request ' + i);
  const r = rateLimit.take('k', 20, t0);
  assert.equal(r.ok, false);
  assert.equal(r.retryAfter, 3); // 1 token per 3s at 20/min
});

test('take: refills linearly over time and never above capacity', () => {
  const t0 = 5000000;
  for (let i = 0; i < 20; i++) rateLimit.take('k', 20, t0);
  assert.equal(rateLimit.take('k', 20, t0 + 1000).ok, false);
  assert.equal(rateLimit.take('k', 20, t0 + 3000).ok, true);   // one token back
  assert.equal(rateLimit.take('k', 20, t0 + 3001).ok, false);
  // After a long idle period, still capped at 20.
  let n = 0;
  while (rateLimit.take('k', 20, t0 + 10 * 60 * 1000).ok) n++;
  assert.equal(n, 20);
});

test('take: keys are independent', () => {
  const t = 9000000;
  for (let i = 0; i < 3; i++) rateLimit.take('a', 3, t);
  assert.equal(rateLimit.take('a', 3, t).ok, false);
  assert.equal(rateLimit.take('b', 3, t).ok, true);
});

test('clientIp: first x-forwarded-for hop, then x-real-ip, then socket', () => {
  assert.equal(rateLimit.clientIp({ headers: { 'x-forwarded-for': '198.51.100.7, 10.0.0.1' } }), '198.51.100.7');
  assert.equal(rateLimit.clientIp({ headers: { 'x-real-ip': '198.51.100.8' } }), '198.51.100.8');
  assert.equal(rateLimit.clientIp({ headers: {}, socket: { remoteAddress: '::1' } }), '::1');
  assert.equal(rateLimit.clientIp({}), 'unknown');
});

test('enforce: 60/min per IP by default, then 429 with Retry-After', () => {
  for (let i = 0; i < 60; i++) assert.equal(rateLimit.enforce(req('192.0.2.1'), fakeRes(), { scope: 't' }), true);
  const res = fakeRes();
  assert.equal(rateLimit.enforce(req('192.0.2.1'), res, { scope: 't' }), false);
  assert.equal(res.statusCode, 429);
  assert.ok(Number(res.headers['Retry-After']) >= 1);
  const b = JSON.parse(res.body);
  assert.match(b.error, /too quickly/);
  assert.equal(typeof b.retry_after, 'number');
  // A different IP is unaffected.
  assert.equal(rateLimit.enforce(req('192.0.2.2'), fakeRes(), { scope: 't' }), true);
});

test('enforce: 20/min per user, independent of IP', () => {
  for (let i = 0; i < 20; i++) assert.equal(rateLimit.enforce(req('192.0.2.' + i), fakeRes(), { scope: 't', userId: 'u1' }), true);
  assert.equal(rateLimit.enforce(req('192.0.2.99'), fakeRes(), { scope: 't', userId: 'u1' }), false);
  assert.equal(rateLimit.enforce(req('192.0.2.99'), fakeRes(), { scope: 't', userId: 'u2' }), true);
});

test('enforce: scopes are independent', () => {
  for (let i = 0; i < 60; i++) rateLimit.enforce(req('192.0.2.5'), fakeRes(), { scope: 'ask' });
  assert.equal(rateLimit.enforce(req('192.0.2.5'), fakeRes(), { scope: 'ask' }), false);
  assert.equal(rateLimit.enforce(req('192.0.2.5'), fakeRes(), { scope: 'ai' }), true);
});

test('memory stays bounded', () => {
  const { MAX_KEYS, buckets } = rateLimit._internal;
  const t = 42;
  for (let i = 0; i < MAX_KEYS + 50; i++) rateLimit.take('k' + i, 5, t);
  assert.ok(buckets.size <= MAX_KEYS);
});

test('api/ask: 61st request in a minute from one IP gets 429 before any AI call', async () => {
  const handler = require('../ask');
  const orig = global.fetch;
  let aiCalls = 0;
  global.fetch = async () => { aiCalls++; throw new Error('no network in tests'); };
  delete process.env.OPENAI_API_KEY; // 503 path: cheap, but still behind the limiter
  try {
    for (let i = 0; i < 60; i++) {
      const res = fakeRes();
      await handler(req('203.0.113.50'), res);
      assert.equal(res.statusCode, 503);
    }
    const res = fakeRes();
    await handler(req('203.0.113.50'), res);
    assert.equal(res.statusCode, 429);
    assert.ok(res.headers['Retry-After']);
    assert.equal(aiCalls, 0);
  } finally { global.fetch = orig; }
});

test('api/ai: per-IP limit applies to the public analyze action', async () => {
  const handler = require('../ai');
  delete process.env.OPENAI_API_KEY;
  for (let i = 0; i < 60; i++) {
    const res = fakeRes();
    await handler(req('203.0.113.60'), res);
    assert.equal(res.statusCode, 503);
  }
  const res = fakeRes();
  await handler(req('203.0.113.60'), res);
  assert.equal(res.statusCode, 429);
});
