'use strict';
const test = require('node:test');
const assert = require('node:assert');
const L = require('../_lib/leadEmails');
const handler = require('../me/plan.js');
const rateLimit = require('../_lib/rateLimit');

const NOW = Date.parse('2026-11-21T15:00:00Z');
const D = 86400000;
const role = (id, family, cc, daysAgo, title) => ({ id, family, country: cc, title: title || 'Role ' + id, company: 'Co ' + id, location: 'Remote', tags: ['Python'], posted: new Date(NOW - daysAgo * D).toISOString() });
const FEED = [role('a', 'data', 'US', 1), role('b', 'data', 'US', 3), role('c', 'ai', 'US', 1), role('d', 'data', 'DE', 1), role('e', 'data', 'US', 20)];
const lead = (x) => Object.assign({ id: '11111111-1111-4111-8111-111111111111', email: 'a@example.com', family: 'data', cc: 'US', status: 'confirmed', created_at: new Date(NOW - 30 * D).toISOString(), confirmed_at: new Date(NOW - 30 * D).toISOString(), last_sent_at: null }, x || {});

test('cleaning: email, role type, country', () => {
  assert.strictEqual(L.cleanEmail('  Ann@Example.COM '), 'ann@example.com');
  for (const bad of ['', 'a@b', 'a b@c.com', 'a@@c.com', 'x@y.z', '<a>@b.com', 'a@b.com,c@d.com']) assert.strictEqual(L.cleanEmail(bad), '', bad);
  assert.strictEqual(L.cleanFamily('data'), 'data');
  assert.strictEqual(L.cleanFamily('__proto__'), '');
  assert.strictEqual(L.cleanFamily('nope'), '');
  assert.strictEqual(L.cleanCc('us'), 'US');
  assert.strictEqual(L.cleanCc('USA'), '');
});

test('signed links: one purpose, one id', () => {
  process.env.EMAIL_UNSUB_SECRET = 'secret';
  const id = lead().id;
  const t = L.token('confirm', id);
  assert.ok(L.checkToken('confirm', id, t));
  assert.ok(!L.checkToken('unsub', id, t), 'a confirm token must not unsubscribe');
  assert.ok(!L.checkToken('confirm', '22222222-2222-4222-8222-222222222222', t));
  assert.ok(!L.checkToken('confirm', id, ''));
  assert.match(L.confirmUrl(id), /op=lead-confirm&i=/);
  assert.match(L.unsubUrl(id), /op=lead-unsub&i=/);
});

test('digest: new roles in the role type and country, newest first, weekly, none → null', () => {
  const p = L.pickDigest(lead(), FEED, NOW);
  assert.deepStrictEqual(p.roles.map((r) => r.id), ['a', 'b']); // not ai, not DE, not 20 days old
  assert.strictEqual(p.total, 2);
  assert.strictEqual(L.pickDigest(lead({ last_sent_at: new Date(NOW - 2 * D).toISOString() }), FEED, NOW), null, 'only once a week');
  assert.deepStrictEqual(L.pickDigest(lead({ last_sent_at: new Date(NOW - 7 * D).toISOString() }), FEED, NOW).roles.map((r) => r.id), ['a', 'b']);
  assert.deepStrictEqual(L.pickDigest(lead({ last_sent_at: new Date(NOW - 8 * D).toISOString(), confirmed_at: new Date(NOW - 2 * D).toISOString() }), FEED, NOW).roles.map((r) => r.id), ['a'], 'only roles newer than last digest');
  assert.deepStrictEqual(L.pickDigest(lead({ cc: '' }), FEED, NOW).roles.map((r) => r.id), ['a', 'd', 'b']);
  assert.strictEqual(L.pickDigest(lead({ family: 'fde' }), FEED, NOW), null);
  assert.strictEqual(L.pickDigest(lead({ status: 'pending' }), FEED, NOW), null);
  assert.strictEqual(L.pickDigest(lead({ status: 'unsubscribed' }), FEED, NOW), null);
});

test('messages carry the postal address, the lead’s own unsubscribe link, and no account wording', () => {
  process.env.EMAIL_POSTAL_ADDRESS = 'PO Box 1, Example City'; process.env.EMAIL_UNSUB_SECRET = 'secret';
  const l = lead();
  for (const m of [L.confirmMessage(l), L.digestMessage(l, L.pickDigest(l, FEED, NOW))]) {
    assert.match(m.html, /PO Box 1, Example City/);
    assert.match(m.text, /PO Box 1, Example City/);
    assert.ok(m.html.includes('op=lead-unsub'), 'unsubscribe link');
    assert.ok(m.text.includes('op=lead-unsub'));
    assert.ok(!/created an OfferReady account/.test(m.html + m.text));
  }
  const c = L.confirmMessage(l);
  assert.ok(c.html.includes('op=lead-confirm'));
  assert.match(c.text, /Nothing is sent until you confirm/);
  const d = L.digestMessage(l, L.pickDigest(l, FEED, NOW));
  assert.match(d.subject, /2 new roles/);
  assert.match(d.html, /\/interviews\/co-a\/role-a/);
  delete process.env.EMAIL_POSTAL_ADDRESS;
});

test('stale pending sign-ups are dropped after 14 days', () => {
  assert.ok(L.stalePending(lead({ status: 'pending', created_at: new Date(NOW - 15 * D).toISOString() }), NOW));
  assert.ok(!L.stalePending(lead({ status: 'pending', created_at: new Date(NOW - 5 * D).toISOString() }), NOW));
  assert.ok(!L.stalePending(lead({ status: 'confirmed', created_at: new Date(NOW - 50 * D).toISOString() }), NOW));
});

// ---- the endpoint, against an in-memory stand-in for the database and Resend ----

function call(req) {
  return new Promise((resolve) => {
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; return this; },
      status(c) { this.statusCode = c; return this; }, end(b) { let body = null; try { body = JSON.parse(b); } catch (_e) { body = b; } resolve({ status: this.statusCode, body, headers: this.headers }); } };
    handler(Object.assign({ headers: { 'x-forwarded-for': '9.9.9.' + Math.floor(Math.random() * 250) }, query: {} }, req), res);
  });
}
function fakeWorld() {
  const rows = []; const sent = []; let n = 0;
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    url = String(url); opts = opts || {};
    const json = (b, status) => ({ ok: (status || 200) < 400, status: status || 200, json: async () => JSON.parse(JSON.stringify(b)) });
    if (url.startsWith('https://api.resend.com') && global.__mailDown) return { ok: false, status: 403, json: async () => ({}) };
    if (url.startsWith('https://api.resend.com')) { const b = JSON.parse(opts.body); sent.push({ to: b.to[0], subject: b.subject, text: b.text, headers: b.headers }); return json({ id: 'r' + sent.length }); }
    const u = new URL(url); const m = opts.method || 'GET';
    if (u.pathname.endsWith('/email_leads')) {
      const email = (u.searchParams.get('email') || '').replace(/^eq\./, ''); const id = (u.searchParams.get('id') || '').replace(/^eq\./, '');
      const pick = rows.filter((r) => (!email || r.email === email) && (!id || r.id === id) && (!u.searchParams.get('status') || r.status === u.searchParams.get('status').replace(/^eq\./, '')));
      if (m === 'GET') return json(pick);
      if (m === 'POST') { const b = JSON.parse(opts.body); if (rows.some((r) => r.email === b.email)) return json([]); const r = Object.assign({ id: '00000000-0000-4000-8000-' + String(++n).padStart(12, '0'), status: 'pending', created_at: new Date().toISOString(), confirm_sent_at: null, confirmed_at: null, last_sent_at: null }, b); rows.push(r); return json([r]); }
      if (m === 'PATCH') {
        const b = JSON.parse(opts.body); const or = u.searchParams.get('or') || ''; const out = [];
        for (const r of pick) {
          const col = /confirm_sent_at/.test(or) ? 'confirm_sent_at' : /last_sent_at/.test(or) ? 'last_sent_at' : null;
          if (col) { const lim = or.match(/\.lt\.([^,)]+)/)[1]; if (r[col] && !(Date.parse(r[col]) < Date.parse(lim))) continue; }
          Object.assign(r, b); out.push(r);
        }
        return json(out);
      }
      if (m === 'DELETE') { for (const r of pick) rows.splice(rows.indexOf(r), 1); return json([]); }
    }
    if (u.pathname.includes('/rpc/')) return json([]);
    return json([], 404);
  };
  return { rows, sent, restore() { global.fetch = realFetch; } };
}
function env() {
  Object.assign(process.env, { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', RESEND_API_KEY: 'rk', LIFECYCLE_EMAILS: 'on', EMAIL_POSTAL_ADDRESS: 'PO Box 1', EMAIL_LEADS: 'on', EMAIL_UNSUB_SECRET: 'secret' });
}
function unenv() { for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'LIFECYCLE_EMAILS', 'EMAIL_POSTAL_ADDRESS', 'EMAIL_LEADS', 'EMAIL_UNSUB_SECRET', 'CRON_SECRET']) delete process.env[k]; }
const signup = (body) => call({ method: 'POST', query: { op: 'lead-signup' }, body });
const qOf = (url) => { const u = new URL(url); return { op: u.searchParams.get('op'), i: u.searchParams.get('i'), t: u.searchParams.get('t') }; };

test('sign-up is closed until EMAIL_LEADS=on and email is set up', async () => {
  unenv(); rateLimit._internal._reset();
  assert.deepStrictEqual((await call({ method: 'GET', query: { op: 'lead-signup' } })).body, { available: false });
  const r = await signup({ email: 'a@example.com' });
  assert.strictEqual(r.body.ok, false);
});

test('sign-up → confirmation email only, nothing else until confirmed; answers the same for everyone', async () => {
  env(); rateLimit._internal._reset(); const w = fakeWorld();
  try {
    assert.deepStrictEqual((await call({ method: 'GET', query: { op: 'lead-signup' } })).body, { available: true });
    assert.strictEqual((await signup({ email: 'nope' })).status, 400);
    assert.strictEqual((await signup({ email: 'bot@example.com', website: 'http://spam' })).body.ok, true);
    assert.strictEqual(w.rows.length, 0, 'honeypot stores nothing');
    const r = await signup({ email: 'Ann@Example.com', family: 'data', cc: 'us' });
    assert.deepStrictEqual(r.body, { ok: true });
    assert.strictEqual(w.rows.length, 1);
    assert.strictEqual(w.rows[0].status, 'pending');
    assert.strictEqual(w.rows[0].email, 'ann@example.com');
    assert.strictEqual(w.rows[0].cc, 'US');
    assert.strictEqual(w.sent.length, 1);
    assert.match(w.sent[0].subject, /Confirm/);
    assert.match(w.sent[0].headers['List-Unsubscribe'], /op=lead-unsub/);
    // Same address again within a day: same answer, no second email.
    assert.deepStrictEqual((await signup({ email: 'ann@example.com', family: 'data', cc: 'US' })).body, { ok: true });
    assert.strictEqual(w.sent.length, 1);
  } finally { w.restore(); unenv(); }
});

test('if the mail service refuses the confirmation, the person is told and can retry at once', async () => {
  env(); rateLimit._internal._reset(); const w = fakeWorld();
  try {
    global.__mailDown = true;
    const r = await signup({ email: 'ann@example.com', family: 'data', cc: 'US' });
    assert.strictEqual(r.status, 502);
    assert.match(r.body.error, /couldn’t send the confirmation email/);
    assert.strictEqual(w.sent.length, 0);
    assert.strictEqual(w.rows[0].confirm_sent_at, null, 'the once-a-day claim is released');
    global.__mailDown = false;
    assert.deepStrictEqual((await signup({ email: 'ann@example.com', family: 'data', cc: 'US' })).body, { ok: true });
    assert.strictEqual(w.sent.length, 1);
  } finally { global.__mailDown = false; w.restore(); unenv(); }
});

test('confirm needs the signed link and a button press (a GET alone confirms nothing)', async () => {
  env(); rateLimit._internal._reset(); const w = fakeWorld();
  try {
    await signup({ email: 'ann@example.com', family: 'ai', cc: 'US' });
    const lead0 = w.rows[0];
    const link = qOf(L.confirmUrl(lead0.id));
    assert.strictEqual((await call({ method: 'GET', query: { op: 'lead-confirm', i: lead0.id, t: 'wrong' } })).status, 400);
    const page = await call({ method: 'GET', query: link });
    assert.strictEqual(page.status, 200);
    assert.strictEqual(lead0.status, 'pending', 'scanners opening the link do not confirm');
    assert.strictEqual((await call({ method: 'POST', query: link })).status, 200);
    assert.strictEqual(lead0.status, 'confirmed');
    assert.ok(lead0.confirmed_at);
    // The unsubscribe token can't confirm.
    assert.strictEqual((await call({ method: 'GET', query: { op: 'lead-confirm', i: lead0.id, t: L.token('unsub', lead0.id) } })).status, 400);
  } finally { w.restore(); unenv(); }
});

test('one-click unsubscribe stops everything; signing up again needs a new confirmation', async () => {
  env(); rateLimit._internal._reset(); const w = fakeWorld();
  try {
    await signup({ email: 'ann@example.com', family: 'data', cc: 'US' });
    const l0 = w.rows[0]; l0.status = 'confirmed';
    const link = qOf(L.unsubUrl(l0.id));
    assert.strictEqual((await call({ method: 'POST', query: link })).status, 200); // what a mail app's one-click does
    assert.strictEqual(l0.status, 'unsubscribed');
    assert.strictEqual((await call({ method: 'POST', query: link })).status, 200, 'repeat is fine');
    assert.strictEqual(L.pickDigest(l0, FEED, NOW), null);
    l0.confirm_sent_at = new Date(Date.now() - 2 * D).toISOString();
    await signup({ email: 'ann@example.com', family: 'data', cc: 'US' });
    assert.strictEqual(l0.status, 'pending');
    assert.strictEqual(w.sent.length, 2);
  } finally { w.restore(); unenv(); }
});

test('the daily run sends each confirmed lead one digest a week, and drops stale pending sign-ups', async () => {
  env(); rateLimit._internal._reset(); const w = fakeWorld();
  process.env.CRON_SECRET = 's';
  const had = process.env.ROLES_FEED_URL;
  const inner = global.fetch;
  global.fetch = async (url, opts) => String(url).includes('roles-feed.test')
    ? { ok: true, json: async () => ({ roles: [role('a', 'data', 'US', 0.1, 'Fresh Data Role'), role('z', 'ai', 'US', 0.1)].map((r) => Object.assign(r, { posted: new Date(Date.now() - 3600000).toISOString() })) }) }
    : inner(url, opts);
  process.env.ROLES_FEED_URL = 'https://roles-feed.test/roles.json';
  const run = () => call({ method: 'GET', query: { op: 'lifecycle-emails' }, headers: { authorization: 'Bearer s' } });
  try {
    w.rows.push({ id: '33333333-3333-4333-8333-333333333333', email: 'c@example.com', family: 'data', cc: 'US', status: 'confirmed', created_at: new Date(Date.now() - 30 * D).toISOString(), confirmed_at: new Date(Date.now() - 30 * D).toISOString(), last_sent_at: null });
    w.rows.push({ id: '44444444-4444-4444-8444-444444444444', email: 'old@example.com', family: 'data', cc: 'US', status: 'pending', created_at: new Date(Date.now() - 20 * D).toISOString(), confirm_sent_at: null, last_sent_at: null });
    w.rows.push({ id: '55555555-5555-4555-8555-555555555555', email: 'gone@example.com', family: 'data', cc: 'US', status: 'unsubscribed', created_at: new Date(Date.now() - 30 * D).toISOString(), confirmed_at: new Date(Date.now() - 30 * D).toISOString(), last_sent_at: null });
    const r1 = await run();
    assert.strictEqual(r1.body.leads_sent, 1);
    assert.deepStrictEqual(w.sent.map((m) => m.to), ['c@example.com'], 'only the confirmed lead');
    assert.match(w.sent[0].subject, /new role/i);
    assert.match(w.sent[0].text, /Fresh Data Role/);
    assert.ok(!/Role z/.test(w.sent[0].text), 'only the role type they picked');
    assert.ok(w.sent[0].headers['List-Unsubscribe-Post']);
    assert.ok(!w.rows.some((r) => r.email === 'old@example.com'), 'stale pending dropped');
    assert.ok(w.rows.some((r) => r.email === 'gone@example.com'), 'unsubscribed rows are kept so we remember');
    const r2 = await run();
    assert.strictEqual(r2.body.leads_sent, 0, 'not again the same week');
    assert.strictEqual(w.sent.length, 1);
    // Dry run when email isn't fully set up: reports, sends nothing.
    delete process.env.RESEND_API_KEY; w.rows[0].last_sent_at = null;
    const r3 = await run();
    assert.strictEqual(r3.body.dry_run, true);
    assert.strictEqual(r3.body.leads_would_send, 1);
    assert.strictEqual(w.sent.length, 1);
  } finally { global.fetch = inner; if (had === undefined) delete process.env.ROLES_FEED_URL; else process.env.ROLES_FEED_URL = had; w.restore(); unenv(); }
});
