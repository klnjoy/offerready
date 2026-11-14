const test = require('node:test');
const assert = require('node:assert');
const { _periodParam: periodParam } = require('../me/plan');

test('admin period: ?days=N as before', () => {
  const p = periodParam({ days: '7' }, 365, 30);
  assert.strictEqual(p.days, 7);
  assert.ok(Math.abs(Date.parse(p.since) - (Date.now() - 7 * 864e5)) < 5000);
  assert.strictEqual(periodParam({}, 365, 30).days, 30);
  assert.strictEqual(periodParam({ days: '9999' }, 365, 30).days, 365);
});

test('admin period: ?since=<ISO> starts at the picked moment', () => {
  const start = new Date(Date.now() - 3.5 * 864e5).toISOString();
  const p = periodParam({ since: start, days: '90' }, 365, 30);
  assert.strictEqual(p.since, start);
  assert.strictEqual(p.days, 4); // spans parts of 4 days
  const withOffset = new Date(Date.now() - 864e5).toISOString().replace('Z', '+00:00');
  assert.strictEqual(periodParam({ since: withOffset }, 365, 30).days, 1);
});

test('admin period: a bad, future or too-old since falls back to days', () => {
  for (const since of ['nope', '2026-11-01', new Date(Date.now() + 864e5).toISOString(), new Date(Date.now() - 400 * 864e5).toISOString(), "2026-11-01T00:00:00Z'; drop"]) {
    const p = periodParam({ since, days: '7' }, 365, 30);
    assert.strictEqual(p.days, 7, since);
  }
});
