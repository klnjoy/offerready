/**
 * Tests for invite friends (api/_lib/referrals.js): codes, stats, and the
 * redeem flow — both sides earn, self-referrals and duplicates pay nothing.
 * Global fetch is stubbed for the Supabase REST calls; billing.claimOnce
 * runs against the same stub. Node built-in runner (node --test).
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const referrals = require('../_lib/referrals');
const { generateCode, normalizeCode, getOrCreateCode, referralStats, redeemCode, REFERRAL_MOCK_CREDITS } = referrals;

const SB = 'https://sb.example.com';
const realFetch = global.fetch;

const INVITER = '11111111-1111-1111-1111-111111111111';
const FRIEND = '22222222-2222-2222-2222-222222222222';
const CODE = 'K7Q2M9XD';

function setEnv() {
  process.env.SUPABASE_URL = SB;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
}

function clearEnv() {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function res(status, json) {
  return { ok: status >= 200 && status < 300, status, json: async () => json };
}

/**
 * Stub fetch with per-URL canned answers. Each entry is [match, answer]
 * where match is a substring of the URL and answer is a response object or
 * a function (method, body) => response. Every call is logged for assertions.
 */
function stubFetch(entries) {
  const calls = [];
  global.fetch = async (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method, url: String(url), body });
    for (const [match, answer] of entries) {
      if (String(url).includes(match)) {
        return typeof answer === 'function' ? answer(method, body) : answer;
      }
    }
    throw new Error('unexpected fetch: ' + method + ' ' + url);
  };
  return calls;
}

test.beforeEach(() => setEnv());
test.afterEach(() => { global.fetch = realFetch; clearEnv(); });

test('generateCode: 8 chars from the unambiguous alphabet', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) {
    const c = generateCode();
    assert.match(c, /^[A-Z2-9]{8}$/);
    assert.ok(!/[01ILO]/.test(c), 'no confusable chars in ' + c);
    seen.add(c);
  }
  assert.equal(seen.size, 200);
});

test('normalizeCode: trims, uppercases, rejects anything that cannot be a code', () => {
  assert.equal(normalizeCode(' k7q2m9xd '), 'K7Q2M9XD');
  assert.equal(normalizeCode('K7Q2M9XD'), 'K7Q2M9XD');
  assert.equal(normalizeCode('short'), null);
  assert.equal(normalizeCode('K7Q2M9XDO'), null); // 9 chars
  assert.equal(normalizeCode('K7Q2M9X!'), null); // bad char
  assert.equal(normalizeCode('K7Q2M9XO'), null); // O is not in the alphabet
  assert.equal(normalizeCode(''), null);
  assert.equal(normalizeCode(null), null);
});

test('getOrCreateCode: returns the existing code without writing', async () => {
  const calls = stubFetch([
    ['/referral_codes?user_id=eq.', res(200, [{ code: CODE }])],
  ]);
  assert.equal(await getOrCreateCode(INVITER), CODE);
  assert.equal(calls.length, 1);
});

test('getOrCreateCode: creates one when missing, retries once on a collision', async () => {
  let posts = 0;
  const calls = stubFetch([
    ['/referral_codes?user_id=eq.', res(200, [])],
    ['/referral_codes', (method) => { posts += 1; return posts === 1 ? res(409, {}) : res(201, {}); }],
  ]);
  const code = await getOrCreateCode(INVITER);
  assert.match(code, /^[A-Z2-9]{8}$/);
  assert.equal(posts, 2);
  assert.equal(calls.filter((c) => c.method === 'POST').length, 2);
});

test('referralStats: invited count and credits earned at one per friend', async () => {
  stubFetch([
    ['/referral_redemptions?inviter_user_id=eq.', res(200, [{ id: 'a' }, { id: 'b' }, { id: 'c' }])],
  ]);
  const stats = await referralStats(INVITER);
  assert.deepEqual(stats, { invited: 3, credits_earned: 3 * REFERRAL_MOCK_CREDITS });
});

function happyPathEntries() {
  return [
    ['/referral_codes?code=eq.', res(200, [{ user_id: INVITER }])],
    ['/referral_redemptions?invitee_user_id=eq.', res(200, [])],
    ['/webhook_events', res(201, {})],
    ['/credit_ledger?user_id=eq.', res(200, [])],
    ['/credit_ledger', res(201, {})],
    ['/referral_redemptions', res(201, {})],
  ];
}

test('redeemCode: happy path grants both sides once and records the redemption', async () => {
  const calls = stubFetch(happyPathEntries());
  const out = await redeemCode(FRIEND, 'k7q2m9xd'); // lowercase in, still works
  assert.deepEqual(out, { ok: true, granted: REFERRAL_MOCK_CREDITS });
  assert.equal(REFERRAL_MOCK_CREDITS, 1);
  const ledger = calls.filter((c) => c.url.includes('/credit_ledger') && c.method === 'POST');
  assert.equal(ledger.length, 2);
  const byUser = {};
  for (const l of ledger) byUser[l.body.user_id] = l.body;
  assert.deepEqual(byUser[INVITER], { user_id: INVITER, feature: 'voice_mock', delta: 1, source: 'referral:inviter:' + FRIEND });
  assert.deepEqual(byUser[FRIEND], { user_id: FRIEND, feature: 'voice_mock', delta: 1, source: 'referral:invitee:' + FRIEND });
  const red = calls.filter((c) => c.url.includes('/referral_redemptions') && c.method === 'POST');
  assert.equal(red.length, 1);
  assert.equal(red[0].body.code, CODE);
  assert.equal(red[0].body.inviter_user_id, INVITER);
  assert.equal(red[0].body.invitee_user_id, FRIEND);
  assert.ok(red[0].body.granted_at);
});

test('redeemCode: your own code pays nobody', async () => {
  const calls = stubFetch([
    ['/referral_codes?code=eq.', res(200, [{ user_id: INVITER }])],
  ]);
  const out = await redeemCode(INVITER, CODE);
  assert.deepEqual(out, { ok: false, reason: 'self' });
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0);
});

test('redeemCode: unknown code is invalid, nothing is written', async () => {
  const calls = stubFetch([
    ['/referral_codes?code=eq.', res(200, [])],
  ]);
  assert.deepEqual(await redeemCode(FRIEND, 'ZZZZZZZZ'), { ok: false, reason: 'invalid' });
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0);
});

test('redeemCode: a second code for the same account is a duplicate', async () => {
  const calls = stubFetch([
    ['/referral_codes?code=eq.', res(200, [{ user_id: INVITER }])],
    ['/referral_redemptions?invitee_user_id=eq.', res(200, [{ id: 'already' }])],
  ]);
  assert.deepEqual(await redeemCode(FRIEND, CODE), { ok: false, reason: 'duplicate' });
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0);
});

test('redeemCode: a claimed key (double tap) is a duplicate', async () => {
  const calls = stubFetch([
    ['/referral_codes?code=eq.', res(200, [{ user_id: INVITER }])],
    ['/referral_redemptions?invitee_user_id=eq.', res(200, [])],
    ['/webhook_events', res(409, {})],
  ]);
  assert.deepEqual(await redeemCode(FRIEND, CODE), { ok: false, reason: 'duplicate' });
  assert.equal(calls.filter((c) => c.url.includes('/credit_ledger') && c.method === 'POST').length, 0);
});

test('redeemCode: a retry after a partial failure does not grant the same side twice', async () => {
  // The inviter was already paid (ledger row exists); the friend was not.
  // Route the ledger reads by URL: the inviter's source row exists, the
  // friend's does not.
  const calls = [];
  global.fetch = async (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method, url: String(url), body });
    const u = String(url);
    if (u.includes('/referral_codes?code=eq.')) return res(200, [{ user_id: INVITER }]);
    if (u.includes('/referral_redemptions?invitee_user_id=eq.')) return res(200, []);
    if (u.includes('/webhook_events')) return res(201, {});
    if (u.includes('/credit_ledger?user_id=eq.') && u.includes('referral%3Ainviter%3A')) return res(200, [{ id: 'paid' }]);
    if (u.includes('/credit_ledger?user_id=eq.')) return res(200, []);
    if (u.includes('/credit_ledger')) return res(201, {});
    if (u.includes('/referral_redemptions')) return res(201, {});
    throw new Error('unexpected fetch: ' + method + ' ' + u);
  };
  const out = await redeemCode(FRIEND, CODE);
  assert.deepEqual(out, { ok: true, granted: 1 });
  const ledger = calls.filter((c) => c.url.includes('/credit_ledger') && c.method === 'POST');
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].body.user_id, FRIEND);
});
