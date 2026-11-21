/**
 * Optional email sign-up for visitors without an account (Open roles).
 * ---------------------------------------------------------------------------
 * Flow: sign-up (email + role type + country) -> row 'pending' -> confirmation
 * email -> they click, then press a button on our page (so link scanners can't
 * confirm for them) -> 'confirmed' -> at most one digest a week of new roles in
 * that role type and country. Every email has the postal address and a
 * one-click unsubscribe. Nothing is sent unless EMAIL_LEADS=on plus the usual
 * Resend settings (emails.missingSettings()).
 *
 * Leads have no account, so there's no resume to match: the digest is "new
 * roles posted in <role type>, <country>", the same listings anyone sees on
 * Open roles. Table: email_leads (migration 0033).
 */

'use strict';

const crypto = require('crypto');
const emails = require('./emails');
const { rolePath } = require('./roleEmails');

const DAY = 86400000;
/** Digest at most this often, and list at most this many roles. */
const EVERY_DAYS = 7;
const MAX_LISTED = 8;
/** A pending sign-up is emailed once; if they ignore it, it's deleted after this long. */
const PENDING_DAYS = 14;

const FAMILIES = {
  ai: 'AI / ML engineer', data: 'Data engineer', fde: 'Forward deployed', architect: 'Architect', platform: 'Platform / SRE',
  datasci: 'Data scientist', research: 'Research scientist', solutions: 'Solutions engineer', em: 'Engineering manager',
  tpm: 'Program / project manager', agile: 'Agile coach / Scrum',
};

function leadsOn() { return String(process.env.EMAIL_LEADS || '').toLowerCase() === 'on'; }

/** Lowercased address if it looks valid, else ''. */
function cleanEmail(v) {
  const e = String(v || '').trim().toLowerCase();
  if (e.length < 5 || e.length > 254 || /\s/.test(e)) return '';
  return /^[^@\s,;<>()"]+@[^@\s,;<>()"]+\.[a-z]{2,}$/.test(e) ? e : '';
}
function cleanFamily(v) { const f = String(v || ''); return Object.prototype.hasOwnProperty.call(FAMILIES, f) ? f : ''; }
function cleanCc(v) { return /^[A-Za-z]{2}$/.test(String(v || '')) ? String(v).toUpperCase() : ''; }

// ---- signed links (different purposes never share a token) -----------------

function token(purpose, id) {
  const s = emails.unsubSecret();
  if (!s) return '';
  return crypto.createHmac('sha256', s).update('lead-' + purpose + ':' + String(id)).digest('base64url').slice(0, 32);
}
function checkToken(purpose, id, t) {
  const want = token(purpose, id);
  const got = String(t || '');
  if (!want || want.length !== got.length) return false;
  return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got));
}
function link(op, id) {
  return emails.apiUrl() + '/api/me/plan?op=' + op + '&i=' + encodeURIComponent(id) + '&t=' + token(op === 'lead-confirm' ? 'confirm' : 'unsub', id);
}
const confirmUrl = (id) => link('lead-confirm', id);
const unsubUrl = (id) => link('lead-unsub', id);

// ---- what each lead gets ---------------------------------------------------

function place(lead) {
  const f = FAMILIES[lead.family] || 'every role type';
  return f + (lead.cc ? ' · ' + lead.cc : ' · every country');
}

/** New roles for this lead since they confirmed / the last digest (max 14 days back). Newest first. */
function newRoles(roles, lead, now) {
  const since = Math.max(now - 14 * DAY, Date.parse(lead.last_sent_at || '') || 0, Date.parse(lead.confirmed_at || '') || 0);
  return (roles || [])
    .filter((r) => {
      const t = Date.parse(r.posted || '');
      if (!t || t <= since) return false;
      if (lead.family && r.family !== lead.family) return false;
      if (lead.cc && String(r.country || '').toUpperCase() !== lead.cc) return false;
      return true;
    })
    .sort((a, b) => Date.parse(b.posted) - Date.parse(a.posted));
}

/** The digest for one confirmed lead, or null (not due yet, or nothing new). */
function pickDigest(lead, roles, now) {
  if (!lead || lead.status !== 'confirmed') return null;
  const last = Date.parse(lead.last_sent_at || '') || 0;
  if (last && now - last < EVERY_DAYS * DAY - 3600000) return null;
  const all = newRoles(roles, lead, now);
  if (!all.length) return null;
  return { roles: all.slice(0, MAX_LISTED), total: all.length };
}

/** Pending sign-ups nobody confirmed in PENDING_DAYS (to delete). */
function stalePending(lead, now) {
  return lead.status === 'pending' && now - (Date.parse(lead.created_at || '') || now) > PENDING_DAYS * DAY;
}

function why(lead) { return 'You’re getting this because ' + lead.email + ' was signed up for OfferReady role emails on getofferready.app.'; }
function person(lead) { return { email: lead.email, why: why(lead), unsub_url: unsubUrl(lead.id) }; }

function confirmMessage(lead) {
  const c = {
    subject: 'Confirm your OfferReady role emails',
    preheader: 'One tap to confirm. If it wasn’t you, ignore this email.',
    blocks: [
      { p: 'Hi,' },
      { p: 'Someone (hopefully you) asked for a weekly email of new roles on OfferReady: ' + place(lead) + '. Nothing is sent until you confirm.' },
      { button: { label: 'Confirm my email', path: '', url: confirmUrl(lead.id) } },
      { p: 'If you didn’t ask for this, do nothing. We’ll delete the request and never email you again.' },
    ],
  };
  return emails.buildFrom(c, person(lead));
}

function digestMessage(lead, pick) {
  const total = Math.max(pick.total, pick.roles.length);
  const c = {
    subject: total === 1 ? 'A new role: ' + emails.clip(pick.roles[0].title, 60) : total + ' new roles: ' + (FAMILIES[lead.family] || 'every role type'),
    preheader: 'New this week · ' + place(lead),
    blocks: [
      { p: 'Hi,' },
      { p: (total === 1 ? 'A new role was' : total + ' new roles were') + ' posted in ' + place(lead) + '.' },
      ...pick.roles.map((r) => ({ item: {
        title: emails.clip(r.title, 90) + ' · ' + emails.clip(r.company, 60),
        text: [r.location, (r.tags || []).slice(0, 6).join(', ')].filter(Boolean).join(' · '),
        path: rolePath(r), cta: 'Prepare for this role',
      } })),
      { button: { label: total > pick.roles.length ? 'See all ' + total + ' in Open roles' : 'Open roles', path: '/roles' + (lead.cc ? '?cc=' + lead.cc : '') } },
      { p: 'You asked for these emails. At most one a week, only when there’s something new.' },
    ],
  };
  return emails.buildFrom(c, person(lead));
}

// ---- the pages the links open ----------------------------------------------

function page(state, action) {
  const { esc, C } = emails;
  const btn = (label, strong) => '<form method="post" action="' + esc(action) + '"><button type="submit" style="font:inherit;font-weight:600;padding:12px 22px;border-radius:10px;'
    + (strong ? 'border:0;background:' + C.ink + ';color:#fff' : 'border:1px solid ' + C.border + ';background:#fff;color:' + C.ink) + ';cursor:pointer">' + esc(label) + '</button></form>';
  const m = {
    confirm: ['Confirm your role emails?', 'You’ll get at most one email a week, only when there are new roles for what you picked. You can unsubscribe from any email.', btn('Yes, send me new roles', true)],
    confirmed: ['You’re confirmed', 'We’ll email you when there are new roles for what you picked. Every email has an unsubscribe link.', '<a href="' + esc(emails.appUrl() + '/roles') + '" style="color:' + C.link + ';font-weight:600">Browse open roles now</a>'],
    unsub: ['Stop role emails?', 'You won’t get any more of them.', btn('Unsubscribe', true)],
    unsubbed: ['You’re unsubscribed', 'You won’t get any more role emails. Changed your mind? Sign up again any time on Open roles.', '<a href="' + esc(emails.appUrl() + '/roles') + '" style="color:' + C.link + ';font-weight:600">Open roles</a>'],
    bad: ['That link doesn’t work', 'It may be incomplete or old. Use the link from the latest email, or reply to any email and we’ll remove you.', ''],
    later: ['Something went wrong', 'We couldn’t save that just now. Please try the link again in a minute.', ''],
  }[state] || [];
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>OfferReady emails</title></head>'
    + '<body style="margin:0;background:' + C.soft + ';font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Inter,Roboto,Helvetica,Arial,sans-serif;color:' + C.text + '">'
    + '<div style="max-width:460px;margin:48px auto;padding:28px 24px;background:#fff;border:1px solid ' + C.border + ';border-radius:16px">'
    + '<p style="margin:0 0 18px;font-weight:700;color:' + C.ink + '">OfferReady</p>'
    + '<h1 style="margin:0 0 10px;font-size:22px">' + esc(m[0]) + '</h1>'
    + '<p style="margin:0 0 20px;line-height:1.55;color:' + C.text2 + '">' + esc(m[1]) + '</p>' + (m[2] || '')
    + '</div></body></html>';
}

module.exports = {
  FAMILIES, EVERY_DAYS, MAX_LISTED, PENDING_DAYS,
  leadsOn, cleanEmail, cleanFamily, cleanCc, token, checkToken, confirmUrl, unsubUrl,
  newRoles, pickDigest, stalePending, confirmMessage, digestMessage, page,
};
