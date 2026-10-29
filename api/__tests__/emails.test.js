'use strict';
const test = require('node:test');
const assert = require('node:assert');
const emails = require('../_lib/emails');
const handler = require('../me/plan.js');

const DAY = 86400000;
const NOW = Date.parse('2026-11-10T15:00:00Z');
const UID = '00000000-0000-0000-0000-0000000000a1';
function person(daysAgo, extra) {
  return Object.assign({ user_id: UID, email: 'ann@example.com', first_name: 'Ann', confirmed_at: new Date(NOW - daysAgo * DAY - 3600000).toISOString(),
    job_id: null, job_title: null, job_company: null, practised: false, paid: false, sent: [] }, extra || {});
}
const UPDATE = { month: '2026-11', ready: true, subject: 'News', intro: 'Intro', items: [{ title: 'A', text: 'B', path: '/analyze', cta: 'Go' }], tip: 'Tip' };

test('pickEmail follows the schedule and never repeats', () => {
  assert.strictEqual(emails.pickEmail(person(0), NOW), 'welcome');
  assert.strictEqual(emails.pickEmail(person(1), NOW), 'welcome');
  assert.strictEqual(emails.pickEmail(person(0, { sent: ['welcome'] }), NOW), null);
  // A welcome that was missed isn't sent late.
  assert.strictEqual(emails.pickEmail(person(3), NOW), 'nudge_job');
  assert.strictEqual(emails.pickEmail(person(3, { job_id: 'j' }), NOW), null);
  assert.strictEqual(emails.pickEmail(person(5, { job_id: 'j', sent: ['welcome'] }), NOW), 'practice');
  assert.strictEqual(emails.pickEmail(person(9, { job_id: 'j', sent: ['welcome', 'practice'] }), NOW), 'plans');
  assert.strictEqual(emails.pickEmail(person(9, { paid: true, job_id: 'j', sent: ['practice'] }), NOW), null);
  assert.strictEqual(emails.pickEmail(person(20), NOW), null);
  assert.strictEqual(emails.pickEmail(person(-1), NOW), null);
  assert.strictEqual(emails.pickEmail(person(0, { confirmed_at: null }), NOW), null);
});

test('monthly update: only when ready, this month, confirmed a week ago, once', () => {
  assert.strictEqual(emails.pickEmail(person(30), NOW, UPDATE), 'monthly:2026-11');
  assert.strictEqual(emails.pickEmail(person(30, { paid: true }), NOW, UPDATE), 'monthly:2026-11');
  assert.strictEqual(emails.pickEmail(person(30, { sent: ['monthly:2026-11'] }), NOW, UPDATE), null);
  assert.strictEqual(emails.pickEmail(person(30), NOW, Object.assign({}, UPDATE, { ready: false })), null);
  assert.strictEqual(emails.pickEmail(person(30), NOW, Object.assign({}, UPDATE, { month: '2026-10' })), null);
  assert.strictEqual(emails.pickEmail(person(4), NOW, UPDATE), 'nudge_job');
  assert.strictEqual(emails.pickEmail(person(4, { job_id: 'j' }), NOW, UPDATE), null);
  // Onboarding comes first; the monthly waits for a later run.
  assert.strictEqual(emails.pickEmail(person(9, { sent: ['welcome'] }), NOW, UPDATE), 'plans');
});

test('every email has an unsubscribe link, escapes names and has no prices', () => {
  process.env.EMAIL_POSTAL_ADDRESS = 'PO Box 1, Town, NY 10001';
  const p = person(0, { first_name: '<b>x</b>', job_id: 'j1', job_title: 'ML <Engineer>', job_company: 'Acme' });
  for (const kind of emails.KINDS.concat(['monthly:2026-11'])) {
    const m = emails.build(kind, p, UPDATE);
    assert.ok(m && m.subject && m.html && m.text, kind);
    assert.ok(m.html.includes('op=unsubscribe&amp;u=' + UID), kind + ' html unsub');
    assert.ok(m.text.includes('op=unsubscribe&u=' + UID), kind + ' text unsub');
    assert.ok(m.html.includes('PO Box 1'), kind + ' address');
    assert.ok(!m.html.includes('<b>x</b>') && !m.html.includes('<Engineer>'), kind + ' escaped');
    assert.ok(!/\$\s?\d/.test(m.html + m.text), kind + ' no prices');
  }
  assert.strictEqual(emails.build('nope', p, UPDATE), null);
  delete process.env.EMAIL_POSTAL_ADDRESS;
});

test('unsubscribe tokens are tied to the user', () => {
  process.env.EMAIL_UNSUB_SECRET = 'k1';
  const t = emails.unsubToken(UID);
  assert.ok(t.length >= 20);
  assert.ok(emails.checkUnsubToken(UID, t));
  assert.ok(!emails.checkUnsubToken('00000000-0000-0000-0000-0000000000a2', t));
  assert.ok(!emails.checkUnsubToken(UID, t.slice(1)));
  assert.ok(!emails.checkUnsubToken(UID, ''));
  delete process.env.EMAIL_UNSUB_SECRET;
});

test('missingSettings lists what blocks real sending', () => {
  for (const k of ['LIFECYCLE_EMAILS', 'RESEND_API_KEY', 'EMAIL_POSTAL_ADDRESS']) delete process.env[k];
  assert.deepStrictEqual(emails.missingSettings().slice(0, 3), ['LIFECYCLE_EMAILS=on', 'RESEND_API_KEY', 'EMAIL_POSTAL_ADDRESS']);
});

// ---- routes (fetch is mocked: nothing leaves the machine) -------------------

function call(req) {
  return new Promise((resolve) => {
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; return this; },
      status(c) { this.statusCode = c; return this; },
      end(b) { let body = b; try { body = JSON.parse(b); } catch (_e) { /* html */ } resolve({ status: this.statusCode, headers: this.headers, body }); } };
    handler(Object.assign({ headers: {}, query: {} }, req), res);
  });
}

function withFetch(fn, routes) {
  const real = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts: opts || {} });
    for (const [re, reply] of routes) if (re.test(String(url))) return reply(String(url), opts || {});
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return fn(calls).finally(() => { global.fetch = real; });
}
const ok = (j) => ({ ok: true, status: 200, json: async () => j });

test('the email run needs the cron secret', async () => {
  process.env.CRON_SECRET = 's3cret';
  assert.strictEqual((await call({ method: 'GET', query: { op: 'lifecycle-emails' } })).status, 401);
  assert.strictEqual((await call({ method: 'GET', query: { op: 'lifecycle-emails' }, headers: { authorization: 'Bearer no' } })).status, 401);
  delete process.env.CRON_SECRET;
});

test('the email run is a dry run until switched on, and sends nothing', async () => {
  process.env.CRON_SECRET = 's3cret';
  process.env.SUPABASE_URL = 'https://db.example.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
  for (const k of ['LIFECYCLE_EMAILS', 'RESEND_API_KEY', 'EMAIL_POSTAL_ADDRESS']) delete process.env[k];
  await withFetch(async (calls) => {
    const r = await call({ method: 'GET', query: { op: 'lifecycle-emails' }, headers: { authorization: 'Bearer s3cret' } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.dry_run, true);
    assert.strictEqual(r.body.would_send.welcome, 1);
    assert.ok(!calls.some((c) => /resend\.com|email_sends/.test(c.url)));
  }, [[/rpc\/email_people/, () => ok([person(0, { confirmed_at: new Date().toISOString() })])]]);
});

test('when switched on: claims first, sends once, skips what was already claimed', async () => {
  Object.assign(process.env, { CRON_SECRET: 's3cret', SUPABASE_URL: 'https://db.example.co', SUPABASE_SERVICE_ROLE_KEY: 'svc',
    LIFECYCLE_EMAILS: 'on', RESEND_API_KEY: 're_test', EMAIL_POSTAL_ADDRESS: 'PO Box 1' });
  const now = new Date().toISOString();
  const people = [person(0, { confirmed_at: now }), person(0, { user_id: '00000000-0000-0000-0000-0000000000b2', email: 'b@example.com', confirmed_at: now })];
  let claims = 0;
  await withFetch(async (calls) => {
    const r = await call({ method: 'GET', query: { op: 'lifecycle-emails' }, headers: { authorization: 'Bearer s3cret' } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.sent, 1);
    assert.strictEqual(r.body.skipped, 1);
    const sends = calls.filter((c) => /resend\.com/.test(c.url));
    assert.strictEqual(sends.length, 1);
    const body = JSON.parse(sends[0].opts.body);
    assert.deepStrictEqual(body.to, ['ann@example.com']);
    assert.ok(body.headers['List-Unsubscribe'].includes('op=unsubscribe'));
    assert.strictEqual(body.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  }, [
    [/rpc\/email_people/, () => ok(people)],
    [/email_sends\?on_conflict/, (_u, o) => { claims++; const b = JSON.parse(o.body); return ok(b.user_id === UID ? [b] : []); }],
    [/email_sends\?user_id/, () => ok([])],
    [/resend\.com/, () => ok({ id: 'em_1' })],
  ]);
  assert.strictEqual(claims, 2);
  for (const k of ['LIFECYCLE_EMAILS', 'RESEND_API_KEY', 'EMAIL_POSTAL_ADDRESS', 'CRON_SECRET']) delete process.env[k];
});

test('a failed send frees its claim so a later run can retry', async () => {
  Object.assign(process.env, { CRON_SECRET: 's3cret', SUPABASE_URL: 'https://db.example.co', SUPABASE_SERVICE_ROLE_KEY: 'svc',
    LIFECYCLE_EMAILS: 'on', RESEND_API_KEY: 're_test', EMAIL_POSTAL_ADDRESS: 'PO Box 1' });
  await withFetch(async (calls) => {
    const r = await call({ method: 'GET', query: { op: 'lifecycle-emails' }, headers: { authorization: 'Bearer s3cret' } });
    assert.strictEqual(r.body.sent, 0);
    assert.ok(calls.some((c) => /email_sends\?user_id/.test(c.url) && c.opts.method === 'DELETE'));
  }, [
    [/rpc\/email_people/, () => ok([person(0, { confirmed_at: new Date().toISOString() })])],
    [/email_sends\?on_conflict/, (_u, o) => ok([JSON.parse(o.body)])],
    [/email_sends\?user_id/, () => ok([])],
    [/resend\.com/, () => ({ ok: false, status: 500, json: async () => ({}) })],
  ]);
  for (const k of ['LIFECYCLE_EMAILS', 'RESEND_API_KEY', 'EMAIL_POSTAL_ADDRESS', 'CRON_SECRET']) delete process.env[k];
});

test('unsubscribe: bad links refused, GET only asks, POST saves', async () => {
  process.env.SUPABASE_URL = 'https://db.example.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
  const t = emails.unsubToken(UID);
  assert.strictEqual((await call({ method: 'GET', query: { op: 'unsubscribe', u: UID, t: 'x' + t.slice(1) } })).status, 400);
  await withFetch(async (calls) => {
    const g = await call({ method: 'GET', query: { op: 'unsubscribe', u: UID, t } });
    assert.strictEqual(g.status, 200);
    assert.ok(/<form method="post"/.test(g.body));
    assert.strictEqual(calls.length, 0);
    const p = await call({ method: 'POST', query: { op: 'unsubscribe', u: UID, t } });
    assert.strictEqual(p.status, 200);
    assert.ok(/unsubscribed/.test(p.body));
    assert.strictEqual(JSON.parse(calls[0].opts.body).user_id, UID);
    const u = await call({ method: 'POST', query: { op: 'unsubscribe', u: UID, t, undo: '1' } });
    assert.ok(/subscribed again/.test(u.body));
    assert.strictEqual(calls[1].opts.method, 'DELETE');
  }, [[/email_unsubscribes/, () => ok([])]]);
});

test('welcome-email and email-test need sign-in', async () => {
  assert.strictEqual((await call({ method: 'POST', query: { op: 'welcome-email' } })).status, 401);
  assert.strictEqual((await call({ method: 'POST', query: { op: 'email-test' }, body: { kind: 'welcome' } })).status, 401);
});
