/**
 * GET /api/me/plan  (Vercel serverless function)
 * ---------------------------------------------------------------------------
 * The signed-in user's plan and this month's usage, for the app's plan card,
 * meters and upgrade prompts. Read-only; enforcement lives in each endpoint
 * via api/_lib/plans.js checkQuota.
 *
 * Auth: Supabase bearer token (same as every other user endpoint) -> 401 without.
 *
 * 200 {
 *   plan: 'free' | 'pro',
 *   usage: { [feature]: { used: number, limit: number|null } | { used: null, limit, unknown: true } },
 *   usage_known: boolean,          // false until migration 0010 is applied / on storage errors
 *   limits: { free: {...}, pro: {...} },
 *   period_start: ISO,             // first instant of this UTC month
 *   period_end: ISO,               // when monthly counters reset
 *   plan_known: boolean,           // false if the entitlement lookup itself failed
 *   pass: { kind, kinds, starts_at, expires_at, since } | null,  // live one-time pass(es)
 *   credits: { voice_mock: number },  // mock pack credits left (never expire)
 *   mock_costs: { text, voice },      // mock credits one session costs (passes.MOCK_COSTS)
 *   billing: {
 *     options: ('job'|'pass30'|'pass90'|'pass365'|'mock10'|'monthly'|'annual')[],  // Checkout options this deployment sells
 *     portal: boolean,                           // a Stripe customer exists -> POST /api/billing/portal works
 *     pro_source: 'subscription'|'pass'|'sprint'|null,  // what currently pays for Pro
 *     pass_kind / pass_kinds: the pass in effect now / every live pass
 *     pro_expires_at: ISO|null,                  // renewal / end of the period, or the sprint's end
 *     pro_interval: 'month'|'year'|null,         // subscriptions only
 *     cancel_at_period_end: boolean
 *   }
 * }
 *
 * GET /api/me/plan?op=costs&days=30  (admins only: ADMIN_EMAILS env var)
 * GET /api/me/plan?op=people&days=30 (admins only) -> { days, since, people: { users, visitors } }
 *   (SQL function admin_people, migration 0021).
 * GET /api/me/plan?op=visits&days=30 (admins only) -> { days, since, capped, visitors: [{ id, release,
 *   visits, events: [{ at, event, route, visit, props: { country, region, ref, src, … } }] }] }:
 *   what each not-signed-in browser opened, tapped and how far it scrolled, and when
 *   (product_events). Visitors an admin hid are left out (migration 0024).
 * POST|DELETE /api/me/plan?op=hide-visitor { id } (admins only): mark an 8-char visitor
 *   id as the team's own, or undo it; all admin numbers then leave it out (0024).
 * GET /api/me/plan?op=metrics&days=30 (admins only) -> { days, since, metrics, costs, plans, geo, funnel }:
 *   funnel = browsers reaching each step (admin_funnel2, migration 0025; null until applied);
 *   people, sign-ups, events, page views, feedback, usage and passes sold
 *   (SQL function admin_metrics, migration 0019) plus the AI cost summary.
 *   200 { days, since, rows: [{ feature, calls, users, input_tokens, cached_tokens,
 *         output_tokens, cost_usd, avg_cost_usd, avg_ms, failed }] }
 *   403 for everyone else; 503 { setup: true } until migration 0017 is applied.
 * Emails (migration 0027, api/_lib/emails.js):
 *   GET /api/cron/emails -> ?op=lifecycle-emails (Vercel cron, Bearer CRON_SECRET): the daily
 *     welcome / follow-up / monthly update run; a dry run until LIFECYCLE_EMAILS=on,
 *     RESEND_API_KEY and EMAIL_POSTAL_ADDRESS are set.
 *   POST ?op=welcome-email (signed in): the welcome right after sign-in, same rules.
 *   GET|POST ?op=unsubscribe&u=&t= (signed link, no sign-in): the unsubscribe page / action.
 *   GET ?op=email-status, GET ?op=email-preview&kind=, POST ?op=email-test { kind } (admins only).
 * Lives here (not its own file) to stay within the Vercel Hobby function limit.
 *
 * Never fails because usage storage is missing: the plan still comes back with
 * usage marked unknown, so the app falls back to "allowed".
 */

'use strict';

const { setCors, send } = require('../_lib/http');
const { getUser } = require('../_lib/supabaseAuth');
const { getUsageSummary, LIMITS, periodStart } = require('../_lib/plans');
const billing = require('../_lib/billing');
const aiCost = require('../_lib/aiCost');
const push = require('../_lib/push');
const emails = require('../_lib/emails');
const monthlyUpdate = require('../_lib/monthlyUpdate');

/** The billing block; never throws (storage errors just hide the portal). */
async function billingBlock(userId) {
  const options = billing.availableOptions();
  let st = null;
  try { st = await billing.getBillingState(userId); } catch (_) { st = null; }
  return {
    options,
    portal: !!(process.env.STRIPE_SECRET_KEY && st && st.customerId),
    pro_source: st ? st.proSource : null,
    pro_expires_at: st ? st.proExpiresAt : null,
    pro_interval: st ? st.interval : null,
    cancel_at_period_end: !!(st && st.cancelAtPeriodEnd),
    pass_kind: st ? st.passKind || null : null,
    pass_kinds: st ? st.passKinds || [] : [],
  };
}

// ---- daily question push --------------------------------------------------

function svc(extra) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Object.assign({ apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, extra || {});
}
function restUrl(path) {
  const url = process.env.SUPABASE_URL;
  return url && process.env.SUPABASE_SERVICE_ROLE_KEY ? url.replace(/\/+$/, '') + '/rest/v1' + path : null;
}

/** POST { subscription } saves this device; DELETE { endpoint } removes it. */
async function savePush(req, res, user) {
  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
  const sub = body.subscription || {};
  const endpoint = String((req.method === 'DELETE' ? body.endpoint : sub.endpoint) || '');
  if (!/^https:\/\/[^\s]{10,2000}$/.test(endpoint)) { send(res, 400, { error: 'A push subscription is required.' }); return; }
  const url = restUrl(req.method === 'DELETE'
    ? '/push_subscriptions?endpoint=eq.' + encodeURIComponent(endpoint) + '&user_id=eq.' + encodeURIComponent(user.id)
    : '/push_subscriptions?on_conflict=endpoint');
  if (!url) { send(res, 503, { error: 'Storage isn’t configured.', setup: true }); return; }
  try {
    const r = req.method === 'DELETE'
      ? await fetch(url, { method: 'DELETE', headers: svc({ Prefer: 'return=minimal' }) })
      : await fetch(url, {
        method: 'POST',
        headers: svc({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({ endpoint, user_id: user.id, p256dh: (sub.keys && sub.keys.p256dh) || null, auth: (sub.keys && sub.keys.auth) || null, fail_count: 0 }),
      });
    if (r.status === 404) { send(res, 503, { error: 'Daily notifications need a database update (migration 0018).', setup: true }); return; }
    if (!r.ok) { send(res, 502, { error: 'Couldn’t save that. Please try again.' }); return; }
    send(res, 200, { ok: true, on: req.method !== 'DELETE' });
  } catch (_e) {
    send(res, 502, { error: 'Couldn’t save that. Please try again.' });
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch (_e) { return {}; } }

/** Vercel cron (GET /api/cron/daily-question, Bearer CRON_SECRET): one push per device. */
async function dailyPush(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = (req.headers && req.headers.authorization) || '';
  if (!secret || auth !== 'Bearer ' + secret) { send(res, 401, { error: 'Unauthorized.' }); return; }
  if (!push.configured()) { send(res, 503, { error: 'VAPID keys are not set.' }); return; }
  const listUrl = restUrl('/push_subscriptions?select=endpoint,fail_count&limit=5000');
  if (!listUrl) { send(res, 503, { error: 'Storage isn’t configured.' }); return; }
  let subs = [];
  try { const r = await fetch(listUrl, { headers: svc() }); subs = r.ok ? await r.json() : []; } catch (_e) { subs = []; }
  let sent = 0, removed = 0, failed = 0;
  const now = new Date().toISOString();
  for (let i = 0; i < subs.length; i += 20) {
    await Promise.all(subs.slice(i, i + 20).map(async (s) => {
      let out;
      try { out = await push.sendPush(s.endpoint); } catch (_e) { out = { ok: false, gone: false }; }
      const where = restUrl('/push_subscriptions?endpoint=eq.' + encodeURIComponent(s.endpoint));
      try {
        if (out.gone || (!out.ok && (s.fail_count || 0) >= 4)) { removed++; await fetch(where, { method: 'DELETE', headers: svc() }); }
        else if (out.ok) { sent++; await fetch(where, { method: 'PATCH', headers: svc(), body: JSON.stringify({ last_sent_at: now, fail_count: 0 }) }); }
        else { failed++; await fetch(where, { method: 'PATCH', headers: svc(), body: JSON.stringify({ fail_count: (s.fail_count || 0) + 1 }) }); }
      } catch (_e) { /* bookkeeping is best-effort */ }
    }));
  }
  send(res, 200, { ok: true, devices: subs.length, sent, removed, failed });
}


// ---- welcome, follow-up and monthly update emails (migration 0027) ---------

/** People who may get an email (email_people(), migration 0027). */
async function emailPeople(userId, includeTeam) {
  const url = restUrl('/rpc/email_people');
  if (!url) throw new Error('Supabase not configured');
  const r = await fetch(url, {
    method: 'POST', headers: svc(),
    body: JSON.stringify({ p_since: '1970-01-01T00:00:00Z', p_exclude: includeTeam ? [] : teamEmails(), p_user: userId || null }),
  });
  if (!r.ok) throw new Error('email_people ' + r.status);
  const rows = await r.json();
  return Array.isArray(rows) ? rows : [];
}

/** Claims (user, kind) in email_sends before sending; false if already sent. */
async function claimEmail(userId, kind) {
  const r = await fetch(restUrl('/email_sends?on_conflict=user_id,kind'), {
    method: 'POST', headers: svc({ Prefer: 'resolution=ignore-duplicates,return=representation' }),
    body: JSON.stringify({ user_id: userId, kind }),
  });
  if (!r.ok) throw new Error('email_sends ' + r.status);
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) && rows.length === 1;
}

/** After a send: keep the provider id, or free the claim so a later run retries. */
async function settleEmail(userId, kind, out) {
  const where = restUrl('/email_sends?user_id=eq.' + encodeURIComponent(userId) + '&kind=eq.' + encodeURIComponent(kind));
  try {
    if (out.ok) { if (out.id) await fetch(where, { method: 'PATCH', headers: svc(), body: JSON.stringify({ provider_id: out.id }) }); }
    else await fetch(where, { method: 'DELETE', headers: svc() });
  } catch (_e) { /* best-effort */ }
}

/** Claims, sends and settles one email. Returns true when it went out. */
async function deliverEmail(person, kind) {
  const msg = emails.build(kind, person, monthlyUpdate);
  if (!msg) return false;
  if (!(await claimEmail(person.user_id, kind))) return false;
  const out = await emails.sendEmail(person.email, msg, person.user_id);
  await settleEmail(person.user_id, kind, out);
  if (!out.ok) console.warn('[emails] send failed', kind, out.status);
  return out.ok;
}

/** Who would get which email on a run now: [{ person, kind }]. */
async function plannedEmails(now) {
  const people = await emailPeople(null, false);
  const out = [];
  for (const p of people) { const kind = emails.pickEmail(p, now, monthlyUpdate); if (kind) out.push({ person: p, kind }); }
  // Onboarding emails first, the monthly update after, within the daily cap.
  out.sort((a, b) => (/^monthly:/.test(a.kind) ? 1 : 0) - (/^monthly:/.test(b.kind) ? 1 : 0));
  return out;
}

function countKinds(list) {
  const c = {};
  for (const x of list) c[x.kind] = (c[x.kind] || 0) + 1;
  return c;
}

/** Vercel cron (GET /api/cron/emails, Bearer CRON_SECRET). Dry run unless fully set up. */
async function emailRun(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = (req.headers && req.headers.authorization) || '';
  if (!secret || auth !== 'Bearer ' + secret) { send(res, 401, { error: 'Unauthorized.' }); return; }
  let planned;
  try { planned = await plannedEmails(Date.now()); }
  catch (err) { console.error('[emails run]', err && err.message); send(res, 503, { error: 'Emails need migration 0027_lifecycle_emails.sql.', setup: true }); return; }
  const missing = emails.missingSettings();
  if (missing.length) { send(res, 200, { ok: true, dry_run: true, missing, would_send: countKinds(planned) }); return; }
  const batch = planned.slice(0, emails.dailyCap());
  let sent = 0, skipped = 0, failed = 0;
  for (let i = 0; i < batch.length; i += 5) {
    await Promise.all(batch.slice(i, i + 5).map(async (x) => {
      try { (await deliverEmail(x.person, x.kind)) ? sent++ : skipped++; }
      catch (err) { failed++; console.error('[emails run]', err && err.message); }
    }));
  }
  send(res, 200, { ok: true, dry_run: false, sent, skipped, failed, left_for_tomorrow: planned.length - batch.length, kinds: countKinds(batch) });
}

/** GET|POST /api/me/plan?op=unsubscribe&u=&t= (no sign-in; signed link). */
async function unsubscribe(req, res) {
  const q = req.query || {};
  const userId = String(q.u || '');
  const token = String(q.t || '');
  const html = (status, state) => {
    res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(emails.unsubPage(state, userId, token));
  };
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !emails.checkUnsubToken(userId, token)) { html(400, 'bad'); return; }
  if (req.method === 'GET') { html(200, 'ask'); return; }
  if (req.method !== 'POST') { html(405, 'bad'); return; }
  const undo = q.undo === '1';
  try {
    const r = undo
      ? await fetch(restUrl('/email_unsubscribes?user_id=eq.' + encodeURIComponent(userId)), { method: 'DELETE', headers: svc() })
      : await fetch(restUrl('/email_unsubscribes?on_conflict=user_id'), {
        method: 'POST', headers: svc({ Prefer: 'resolution=ignore-duplicates,return=minimal' }),
        body: JSON.stringify({ user_id: userId, source: 'link' }),
      });
    if (!r.ok) throw new Error('email_unsubscribes ' + r.status);
    html(200, undo ? 'back' : 'done');
  } catch (err) {
    console.error('[emails unsubscribe]', err && err.message);
    html(503, 'later');
  }
}

/** A person row for previews and test sends: the admin's own, or a sample. */
async function sampleEmailPerson(user) {
  let row = null;
  try { row = (await emailPeople(user.id, true))[0] || null; } catch (_e) { row = null; }
  return Object.assign({
    user_id: user.id, email: user.email, first_name: null, confirmed_at: new Date().toISOString(),
    job_id: null, job_title: null, job_company: null, practised: false, paid: false, sent: [],
  }, row || {}, row && row.job_id ? {} : { job_id: '00000000-0000-0000-0000-000000000000', job_title: 'Machine Learning Engineer', job_company: 'Example Co' });
}

function previewKind(k) {
  const kind = String(k || '');
  if (emails.KINDS.includes(kind)) return kind;
  if (kind === 'monthly') return 'monthly:' + monthlyUpdate.month;
  return null;
}

/** Country (ISO code) and region code from Vercel's geo headers; '' when absent. */
function geoFromHeaders(h) {
  const clean = (v, re) => { let x = String(v || '').trim(); try { x = decodeURIComponent(x); } catch (_e) { /* keep raw */ } return re.test(x) ? x : ''; };
  return {
    country: clean(h['x-vercel-ip-country'], /^[A-Z]{2}$/).toUpperCase(),
    region: clean(h['x-vercel-ip-country-region'], /^[A-Za-z0-9]{1,3}$/).toUpperCase(),
  };
}

/**
 * Team accounts left out of the admin numbers so the dashboard shows real
 * users only: everyone in ADMIN_EMAILS plus METRICS_EXCLUDE_EMAILS
 * (comma-separated, lower-cased). Admin access is unchanged.
 */
function teamEmails() {
  const list = (v) => String(v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return Array.from(new Set(list(process.env.ADMIN_EMAILS).concat(list(process.env.METRICS_EXCLUDE_EMAILS))));
}

/**
 * Calls the team-excluding function from migration 0023 (<fn>2); until that
 * migration is applied, falls back to the original function so the
 * dashboard keeps working (team activity then still counts).
 */
async function adminRpcExcludingTeam(fn, since) {
  try { return await adminRpc(fn + '2', since, { p_exclude: teamEmails() }); }
  catch (err) {
    console.warn('[me/plan] ' + fn + '2 unavailable, using ' + fn + ':', err && err.message);
    return adminRpc(fn, since);
  }
}

/** Plan counts and visitor locations (admin_plans_geo(), migrations 0022/0023). */
async function adminPlansGeo(since) { return adminRpcExcludingTeam('admin_plans_geo', since); }

/** All admin dashboard numbers for a period (admin_metrics(), migrations 0019/0023). */
async function adminMetrics(since) { return adminRpcExcludingTeam('admin_metrics', since); }

/** Who the people are (accounts + anonymous visitors), admin_people() (migrations 0021/0023). */
async function adminPeople(since) { return adminRpcExcludingTeam('admin_people', since); }

/**
 * Every event from browsers that weren't signed in, in the period, grouped by
 * browser: what each anonymous visitor opened and when, for the admin's
 * "Not signed in" list (time spent is worked out from these times in the app).
 * Reads product_events directly with the service role: no migration needed.
 * Only the short codes the app already stores are returned (route, country,
 * region, where the visit came from); visitors are keyed by the same 8-char
 * id as admin_people. Capped at 5,000 events, newest periods first if over.
 */
const VISIT_PROPS = ['country', 'region', 'ref', 'src', 'med', 'camp', 'first_ref', 'first_src', 'label', 'to', 'depth'];
async function adminVisits(since) {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  const q = 'select=anon_id,session_id,created_at,event,route,props,release'
    + '&user_id=is.null&created_at=gte.' + encodeURIComponent(since)
    + '&order=created_at.desc&limit=5000';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  let rows;
  try {
    const resp = await fetch(url + '/rest/v1/product_events?' + q, {
      signal: controller.signal,
      headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' },
    });
    if (!resp.ok) throw new Error('product_events ' + resp.status);
    rows = await resp.json();
  } finally { clearTimeout(timer); }
  const by = new Map();
  for (const r of (Array.isArray(rows) ? rows : []).slice().reverse()) {
    const anon = String(r.anon_id || '');
    if (!anon) continue;
    const id = anon.slice(0, 8);
    let v = by.get(id);
    if (!v) { v = { id, release: null, sessions: [], events: [] }; by.set(id, v); }
    let visit = v.sessions.indexOf(r.session_id);
    if (visit < 0) { v.sessions.push(r.session_id); visit = v.sessions.length - 1; }
    const props = {};
    const p = r.props && typeof r.props === 'object' ? r.props : {};
    for (const k of VISIT_PROPS) if (p[k] != null && p[k] !== '') props[k] = String(p[k]).slice(0, 60);
    if (r.release) v.release = String(r.release).slice(0, 64);
    v.events.push({ at: r.created_at, event: String(r.event || ''), route: r.route == null ? null : String(r.route).slice(0, 300), visit: visit + 1, props });
  }
  const hidden = await hiddenVisitors().catch(() => null);
  for (const id of hidden || []) by.delete(id);
  return {
    hide_ready: hidden !== null,
    capped: Array.isArray(rows) && rows.length >= 5000,
    visitors: Array.from(by.values()).map((v) => ({ id: v.id, release: v.release, visits: v.sessions.length, events: v.events })),
  };
}

/** Service-role REST call on admin_hidden_visitors (migration 0024). */
async function hiddenRest(method, query, body) {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const resp = await fetch(url + '/rest/v1/admin_hidden_visitors' + (query ? '?' + query : ''), {
      method, signal: controller.signal,
      headers: Object.assign({ apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' },
        body ? { 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!resp.ok) throw new Error('admin_hidden_visitors ' + resp.status);
    return method === 'GET' ? await resp.json() : null;
  } finally { clearTimeout(timer); }
}

/** The 8-char ids an admin marked as the team's own ("this is me"). */
async function hiddenVisitors() {
  const rows = await hiddenRest('GET', 'select=id');
  return (Array.isArray(rows) ? rows : []).map((r) => String(r.id || '')).filter(Boolean);
}

async function adminRpc(fn, since, extra) {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const resp = await fetch(url + '/rest/v1/rpc/' + fn, {
      method: 'POST', signal: controller.signal,
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ p_since: since }, extra || {})),
    });
    if (!resp.ok) throw new Error(fn + ' ' + resp.status);
    return await resp.json();
  } finally { clearTimeout(timer); }
}
module.exports = async function handler(req, res) {
  setCors(res, req.headers && req.headers.origin);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  const op = req.query && req.query.op;

  // Daily question push (lives here to stay within the Hobby function limit).
  if (op === 'daily-push') { await dailyPush(req, res); return; }
  // Welcome, follow-up and monthly update emails (migration 0027).
  if (op === 'lifecycle-emails') { await emailRun(req, res); return; }
  if (op === 'unsubscribe') { await unsubscribe(req, res); return; }
  if (op === 'welcome-email' && req.method === 'POST') {
    // The app calls this once after sign-in so the welcome arrives right away;
    // the daily run sends it otherwise. Same rules: confirmed, not team, not
    // unsubscribed, only once, only when emails are switched on.
    res.setHeader('Cache-Control', 'private, no-store');
    const u = await getUser(req);
    if (!u) { send(res, 401, { error: 'Sign in first.' }); return; }
    if (emails.missingSettings().length) { send(res, 200, { ok: true, sent: false }); return; }
    try {
      const p = (await emailPeople(u.id, false))[0];
      const sent = !!p && emails.pickEmail(p, Date.now(), null) === 'welcome' && await deliverEmail(p, 'welcome');
      send(res, 200, { ok: true, sent });
    } catch (err) {
      console.error('[emails welcome]', err && err.message);
      send(res, 200, { ok: true, sent: false });
    }
    return;
  }
  if (op === 'email-test' && req.method === 'POST') {
    // Admin: send one email to your own address to see it in a real inbox.
    // Not recorded, so it doesn't change what you'd get later.
    res.setHeader('Cache-Control', 'private, no-store');
    const u = await getUser(req);
    if (!u) { send(res, 401, { error: 'Sign in first.' }); return; }
    if (!aiCost.isAdmin(u.email)) { send(res, 403, { error: 'Only admins can send test emails.' }); return; }
    if (!process.env.RESEND_API_KEY) { send(res, 503, { error: 'Add RESEND_API_KEY in Vercel first.', setup: true }); return; }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const kind = previewKind(body.kind);
    if (!kind) { send(res, 400, { error: 'Unknown email.' }); return; }
    const person = await sampleEmailPerson(u);
    const msg = emails.build(kind, person, monthlyUpdate);
    const out = await emails.sendEmail(u.email, Object.assign({}, msg, { subject: '[Test] ' + msg.subject }), u.id);
    if (!out.ok) { send(res, 502, { error: 'Resend didn’t accept it (' + (out.status || 'no answer') + '). Check the key and that your domain is verified.' }); return; }
    send(res, 200, { ok: true, to: u.email, kind });
    return;
  }
  if (op === 'push-key' && req.method === 'GET') {
    if (!push.configured()) { send(res, 503, { error: 'Daily notifications aren’t set up on this deployment yet.', setup: true }); return; }
    send(res, 200, { publicKey: process.env.VAPID_PUBLIC_KEY }); return;
  }
  if (op === 'push' && (req.method === 'POST' || req.method === 'DELETE')) {
    const u = await getUser(req);
    if (!u) { send(res, 401, { error: 'Sign in to turn on daily notifications.' }); return; }
    await savePush(req, res, u); return;
  }

  // Coarse location for first-party analytics: country and region from the
  // headers Vercel adds to every request. No IP address or city is returned
  // or stored, and no sign-in is needed.
  if (op === 'geo' && req.method === 'GET') {
    res.setHeader('Cache-Control', 'private, no-store');
    send(res, 200, geoFromHeaders(req.headers || {}));
    return;
  }

  // Admin: mark a not-signed-in visitor as the team's own (POST) or undo it
  // (DELETE). Every admin number then leaves that browser out (migration 0024).
  if (op === 'hide-visitor' && (req.method === 'POST' || req.method === 'DELETE')) {
    res.setHeader('Cache-Control', 'private, no-store');
    const u = await getUser(req);
    if (!u) { send(res, 401, { error: 'Sign in first.' }); return; }
    if (!aiCost.isAdmin(u.email)) { send(res, 403, { error: 'Only admins can hide visitors.' }); return; }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const id = String(body.id || (req.query && req.query.id) || '').toLowerCase();
    if (!/^[a-z0-9]{8}$/.test(id)) { send(res, 400, { error: 'That visitor id isn’t valid.' }); return; }
    try {
      if (req.method === 'POST') await hiddenRest('POST', '', { id, hidden_by: String(u.email || '').toLowerCase().slice(0, 200) });
      else await hiddenRest('DELETE', 'id=eq.' + id);
      send(res, 200, { ok: true, id, hidden: req.method === 'POST' });
    } catch (err) {
      console.error('[me/plan hide-visitor]', err && err.message);
      send(res, 503, { error: 'Hiding visitors isn’t set up yet. Run migration 0024_admin_hidden_visitors.sql in Supabase.', setup: true });
    }
    return;
  }

  if (req.method !== 'GET') { send(res, 405, { error: 'Method not allowed.' }); return; }

  const user = await getUser(req);
  if (!user) { send(res, 401, { error: 'Sign in to see your plan.' }); return; }

  if (op === 'email-status' || op === 'email-preview') {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!aiCost.isAdmin(user.email)) { send(res, 403, { error: 'Only admins can see emails.' }); return; }
    if (op === 'email-preview') {
      const kind = previewKind(req.query.kind);
      if (!kind) { send(res, 400, { error: 'Unknown email.' }); return; }
      send(res, 200, Object.assign({ kind }, emails.build(kind, await sampleEmailPerson(user), monthlyUpdate)));
      return;
    }
    const base = { missing: emails.missingSettings(), daily_cap: emails.dailyCap(), monthly: { month: monthlyUpdate.month, ready: !!monthlyUpdate.ready, subject: monthlyUpdate.subject } };
    try {
      const planned = await plannedEmails(Date.now());
      send(res, 200, Object.assign(base, { ready: true, would_send: countKinds(planned), next: planned.slice(0, 50).map((x) => ({ email: x.person.email, kind: x.kind })) }));
    } catch (err) {
      console.error('[emails status]', err && err.message);
      send(res, 200, Object.assign(base, { ready: false, setup: 'Run migration 0027_lifecycle_emails.sql in Supabase.' }));
    }
    return;
  }

  if (op === 'costs') {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!aiCost.isAdmin(user.email)) { send(res, 403, { error: 'Only admins can see AI costs.' }); return; }
    try { send(res, 200, await aiCost.summary(req.query.days)); }
    catch (err) { console.error('[me/plan costs]', err && err.message); send(res, 503, { error: 'Cost log isn’t set up yet. Apply migration 0017_ai_costs.sql in Supabase.', setup: true }); }
    return;
  }

  if (op === 'people') {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!aiCost.isAdmin(user.email)) { send(res, 403, { error: 'Only admins can see people.' }); return; }
    const days = Math.max(1, Math.min(365, Math.round(Number(req.query.days) || 30)));
    const since = new Date(Date.now() - days * 86400000).toISOString();
    try { send(res, 200, { days, since, people: await adminPeople(since) }); }
    catch (err) { console.error('[me/plan people]', err && err.message); send(res, 503, { error: 'The people list isn’t set up yet. Run migration 0021_admin_people.sql in Supabase.', setup: true }); }
    return;
  }

  if (op === 'visits') {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!aiCost.isAdmin(user.email)) { send(res, 403, { error: 'Only admins can see visits.' }); return; }
    const days = Math.max(1, Math.min(365, Math.round(Number(req.query.days) || 30)));
    const since = new Date(Date.now() - days * 86400000).toISOString();
    try { send(res, 200, Object.assign({ days, since }, await adminVisits(since))); }
    catch (err) { console.error('[me/plan visits]', err && err.message); send(res, 503, { error: 'Couldn’t read visits right now.' }); }
    return;
  }

  if (op === 'metrics') {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!aiCost.isAdmin(user.email)) { send(res, 403, { error: 'Only admins can see metrics.' }); return; }
    const days = Math.max(1, Math.min(365, Math.round(Number(req.query.days) || 30)));
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const [m, costs, extra, funnel] = await Promise.all([
      adminMetrics(since).catch((err) => { console.error('[me/plan metrics]', err && err.message); return null; }),
      aiCost.summary(days).catch(() => null),
      // Optional until migration 0022 is applied: the rest of the page still loads.
      adminPlansGeo(since).catch(() => null),
      // Optional until migration 0025 is applied.
      adminRpc('admin_funnel2', since, { p_exclude: teamEmails() }).catch(() => null),
    ]);
    if (!m) { send(res, 503, { error: 'Metrics aren’t set up yet. Apply migration 0019_admin_metrics.sql in Supabase.', setup: true, costs }); return; }
    send(res, 200, { days, since, metrics: m, costs, plans: extra ? extra.plans || [] : null, geo: extra ? extra.geo || [] : null, funnel: funnel && typeof funnel === 'object' ? funnel : null });
    return;
  }

  try {
    const [summary, bill] = await Promise.all([getUsageSummary(user.id), billingBlock(user.id)]);
    res.setHeader('Cache-Control', 'private, no-store');
    send(res, 200, Object.assign({}, summary, { billing: bill }, aiCost.isAdmin(user.email) ? { is_admin: true } : {}));
  } catch (err) {
    // getUsageSummary already fails open internally; this is a last resort.
    console.error('[me/plan] failure:', err && err.name);
    send(res, 200, { plan: 'free', plan_known: false, usage: {}, usage_known: false, limits: LIMITS, period_start: periodStart(), billing: { options: billing.availableOptions(), portal: false, pro_source: null, pro_expires_at: null, pro_interval: null, cancel_at_period_end: false, pass_kind: null, pass_kinds: [] }, pass: null, credits: { voice_mock: 0 }, mock_costs: require('../_lib/passes').MOCK_COSTS });
  }
};

module.exports._teamEmails = teamEmails;
