/**
 * Welcome, follow-up and monthly update emails.
 * ---------------------------------------------------------------------------
 * Who gets what (days counted from when they confirmed their email address):
 *   welcome    day 0–1    everyone (also sent right after sign-in by the app)
 *   nudge_job  day 2–6    no job saved yet: "paste your first job"
 *   practice   day 5–11   has a job: practise for that job
 *   plans      day 9–15   hasn't paid: what a pass includes (no prices, no deadlines)
 *   monthly    once a month, confirmed 7+ days ago (content: monthlyUpdate.js)
 * At most one email per person per daily run, each kind at most once ever
 * (email_sends, migration 0027), never to anyone who unsubscribed, and never
 * to team accounts. Supabase's own sign-in emails are separate and unchanged.
 *
 * Nothing is sent unless LIFECYCLE_EMAILS=on, RESEND_API_KEY and
 * EMAIL_POSTAL_ADDRESS are set (US law requires a postal address in
 * marketing email; a P.O. box is fine). Otherwise the run is a dry run that
 * only reports what it would send.
 */

'use strict';

const crypto = require('crypto');

const DAY = 86400000;
const KINDS = ['welcome', 'nudge_job', 'practice', 'plans'];

const C = { ink: '#16305c', text: '#0c1c38', text2: '#475467', text3: '#667085', border: '#e4e7ec', soft: '#f6f7f9', signal: '#2f7bff', link: '#1d5fd6' };

function appUrl() { return String(process.env.APP_URL || 'https://getofferready.app').replace(/\/+$/, ''); }
function apiUrl() { return String(process.env.API_PUBLIC_URL || 'https://offerready-beta.vercel.app').replace(/\/+$/, ''); }
function postalAddress() { return String(process.env.EMAIL_POSTAL_ADDRESS || '').trim(); }
function dailyCap() { const n = Math.round(Number(process.env.EMAIL_DAILY_CAP)); return n > 0 ? Math.min(n, 2000) : 90; }

/** What's missing before emails can really send ([] = ready). */
function missingSettings() {
  const out = [];
  if (String(process.env.LIFECYCLE_EMAILS || '').toLowerCase() !== 'on') out.push('LIFECYCLE_EMAILS=on');
  if (!process.env.RESEND_API_KEY) out.push('RESEND_API_KEY');
  if (!postalAddress()) out.push('EMAIL_POSTAL_ADDRESS');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) out.push('SUPABASE_SERVICE_ROLE_KEY');
  return out;
}

// ---- unsubscribe links ----------------------------------------------------

function unsubSecret() { return String(process.env.EMAIL_UNSUB_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''); }
function unsubToken(userId) {
  const s = unsubSecret();
  if (!s) return '';
  return crypto.createHmac('sha256', s).update('unsub:' + String(userId)).digest('base64url').slice(0, 32);
}
function checkUnsubToken(userId, token) {
  const want = unsubToken(userId);
  const got = String(token || '');
  if (!want || want.length !== got.length) return false;
  return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got));
}
function unsubUrl(userId) {
  return apiUrl() + '/api/me/plan?op=unsubscribe&u=' + encodeURIComponent(userId) + '&t=' + unsubToken(userId);
}

// ---- who gets what --------------------------------------------------------

/** Days since the email address was confirmed (0 on the day itself). A time
 * slightly ahead of this server's clock (database clock skew, up to an hour)
 * counts as just now; -1 when unknown or further in the future. */
function daysSince(confirmedAt, now) {
  const t = Date.parse(confirmedAt || '');
  if (!Number.isFinite(t) || t - now > 3600000) return -1;
  return Math.max(0, Math.floor((now - t) / DAY));
}

/** The month key for the monthly update, e.g. '2026-11'. */
function monthKey(now) { return new Date(now).toISOString().slice(0, 7); }

/**
 * The one email (kind) this person should get on this run, or null.
 * person: a row from email_people() (sent = kinds already sent).
 */
function pickEmail(person, now, update) {
  const d = daysSince(person.confirmed_at, now);
  if (d < 0) return null;
  const sent = new Set(person.sent || []);
  const has = (k) => sent.has(k);
  if (!has('welcome') && d <= 1) return 'welcome';
  if (!person.job_id && !has('nudge_job') && d >= 2 && d <= 6) return 'nudge_job';
  if (person.job_id && !has('practice') && d >= 5 && d <= 11) return 'practice';
  if (!person.paid && !has('plans') && d >= 9 && d <= 15) return 'plans';
  if (update && update.ready && update.month === monthKey(now) && d >= 7) {
    const k = 'monthly:' + update.month;
    if (!has(k)) return k;
  }
  return null;
}

// ---- the emails -----------------------------------------------------------

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function clip(s, n) { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; }
function link(path) { return appUrl() + path; }
function jobName(p) {
  const t = clip(p.job_title, 60);
  const c = clip(p.job_company, 40);
  if (!t || /^untitled role$/i.test(t)) return c ? 'your ' + c + ' job' : 'your job';
  return c ? t + ' at ' + c : t;
}

/** { subject, preheader, blocks } for one kind; blocks are rendered to HTML and text. */
function content(kind, p, update) {
  const hi = p.first_name ? 'Hi ' + clip(p.first_name, 40) + ',' : 'Hi,';
  if (kind === 'welcome') {
    const job = p.job_id ? { label: 'Open ' + jobName(p), path: '/jobs/' + p.job_id } : { label: 'Analyze a job', path: '/analyze' };
    return {
      subject: 'Welcome to OfferReady',
      preheader: 'Start with one job you want. Here’s how.',
      blocks: [
        { p: hi },
        { p: 'Thanks for confirming your email. OfferReady helps you get ready for one specific job, not interviews in general.' },
        { steps: [
          'Paste a job you want, as a link or the text of the post.',
          'See what it asks for, where you already fit, and the gaps to close.',
          'Practise the questions that job is likely to ask, and get feedback on your answers.',
        ] },
        { button: job },
        { p: 'Your answers and stories come from your own experience. OfferReady helps you say them clearly; it never makes anything up for you.' },
        { p: 'Questions or ideas? Just reply to this email.' },
      ],
    };
  }
  if (kind === 'nudge_job') {
    return {
      subject: 'Have a job in mind? Paste it in',
      preheader: 'It takes about a minute to see what a job needs.',
      blocks: [
        { p: hi },
        { p: 'You haven’t added a job yet. The quickest way to see what OfferReady does is to copy a job post you’re interested in and paste it in. In about a minute you’ll see what it asks for and where you stand.' },
        { button: { label: 'Analyze a job', path: '/analyze' } },
        { p: 'Not applying anywhere yet? The study library and practice questions are free to use anytime.' },
        { more: { label: 'Browse practice questions', path: '/practice' } },
      ],
    };
  }
  if (kind === 'practice') {
    const name = jobName(p);
    return {
      subject: p.practised ? 'Keep your ' + clip(p.job_title || 'interview', 50) + ' prep going' : 'Practise for ' + clip(name, 70),
      preheader: 'A few questions a day adds up before the interview.',
      blocks: [
        { p: hi },
        { p: p.practised
          ? 'You’ve started practising for ' + name + '. Nice. A few questions a day, spread out, does more than one long session the night before.'
          : 'You saved ' + name + '. A good next step is to practise the questions that role is likely to ask.' },
        { steps: [
          'Answer a question in writing or out loud.',
          'Get feedback on what was strong and what was missing.',
          'Turn your best answers into STAR stories you can reuse.',
        ] },
        { button: { label: 'Practise for this job', path: '/practice?job=' + encodeURIComponent(p.job_id) } },
      ],
    };
  }
  if (kind === 'plans') {
    return {
      subject: 'What an OfferReady pass adds',
      preheader: 'Your free account stays free. Here’s what a pass adds.',
      blocks: [
        { p: hi },
        { p: 'Your free account stays free. If you’re in an active job search and want more room, a pass adds:' },
        { list: [
          'More saved jobs and job analyses',
          'Much more AI feedback on your answers',
          'Mock interview credits',
          'The full defend-your-decision scenario library, plus scenarios made for your job',
          'Resume tailoring for each job',
          'Calendar export of your day-by-day plan',
        ] },
        { button: { label: 'See plans', path: '/pricing' } },
        { p: 'No pressure. If the free plan covers what you need, keep using it.' },
      ],
    };
  }
  if (/^monthly:/.test(kind) && update) {
    const blocks = [{ p: hi }, { p: update.intro }];
    for (const it of update.items || []) blocks.push({ item: it });
    if (update.tip) blocks.push({ note: update.tip });
    return { subject: update.subject, preheader: update.preheader || '', blocks };
  }
  return null;
}

function renderHtml(c, p) {
  const out = [];
  for (const b of c.blocks) {
    if (b.p) out.push('<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:' + C.text + '">' + esc(b.p) + '</p>');
    else if (b.steps) {
      out.push('<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;width:100%">' + b.steps.map((s, i) =>
        '<tr><td style="vertical-align:top;width:32px;padding:0 0 10px"><div style="width:24px;height:24px;border-radius:12px;background:' + C.soft + ';border:1px solid ' + C.border + ';color:' + C.ink + ';font-size:13px;font-weight:700;line-height:24px;text-align:center">' + (i + 1) + '</div></td>'
        + '<td style="vertical-align:top;padding:2px 0 10px;font-size:15px;line-height:1.5;color:' + C.text + '">' + esc(s) + '</td></tr>').join('') + '</table>');
    } else if (b.list) {
      out.push('<ul style="margin:0 0 20px;padding-left:20px;color:' + C.text + ';font-size:15px;line-height:1.6">' + b.list.map((s) => '<li style="margin:0 0 4px">' + esc(s) + '</li>').join('') + '</ul>');
    } else if (b.button) {
      out.push('<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 24px"><tr><td style="border-radius:10px;background:' + C.ink + '">'
        + '<a href="' + esc(link(b.button.path)) + '" style="display:inline-block;padding:12px 22px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">' + esc(b.button.label) + '</a></td></tr></table>');
    } else if (b.more) {
      out.push('<p style="margin:0 0 16px;font-size:15px"><a href="' + esc(link(b.more.path)) + '" style="color:' + C.link + ';font-weight:600;text-decoration:none">' + esc(b.more.label) + ' →</a></p>');
    } else if (b.item) {
      out.push('<div style="margin:0 0 14px;padding:16px 18px;border:1px solid ' + C.border + ';border-radius:12px">'
        + '<p style="margin:0 0 6px;font-size:16px;font-weight:700;color:' + C.text + '">' + esc(b.item.title) + '</p>'
        + '<p style="margin:0 0 10px;font-size:15px;line-height:1.5;color:' + C.text2 + '">' + esc(b.item.text) + '</p>'
        + (b.item.path ? '<a href="' + esc(link(b.item.path)) + '" style="font-size:15px;color:' + C.link + ';font-weight:600;text-decoration:none">' + esc(b.item.cta || 'Open') + ' →</a>' : '')
        + '</div>');
    } else if (b.note) {
      out.push('<p style="margin:8px 0 16px;padding:14px 16px;background:' + C.soft + ';border-radius:12px;font-size:15px;line-height:1.5;color:' + C.text + '">' + esc(b.note) + '</p>');
    }
  }
  const addr = postalAddress();
  const foot = 'You’re getting this because you created an OfferReady account with ' + esc(p.email) + '. '
    + '<a href="' + esc(unsubUrl(p.user_id)) + '" style="color:' + C.text3 + ';text-decoration:underline">Unsubscribe</a> from these emails.'
    + (addr ? '<br>' + esc(addr) : '');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>' + esc(c.subject) + '</title></head>'
    + '<body style="margin:0;padding:0;background:' + C.soft + ';font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Inter,Roboto,Helvetica,Arial,sans-serif">'
    + '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + esc(c.preheader || '') + '</div>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + C.soft + '"><tr><td align="center" style="padding:24px 12px">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">'
    + '<tr><td style="padding:0 4px 16px"><a href="' + esc(appUrl()) + '" style="text-decoration:none;color:' + C.ink + ';font-size:18px;font-weight:700">'
    + '<img src="' + esc(appUrl()) + '/icons/icon-192.png" width="28" height="28" alt="" style="vertical-align:middle;border-radius:7px;margin-right:8px;border:0">OfferReady</a></td></tr>'
    + '<tr><td style="background:#ffffff;border:1px solid ' + C.border + ';border-radius:16px;padding:28px 24px">' + out.join('') + '</td></tr>'
    + '<tr><td style="padding:16px 4px 0;font-size:12px;line-height:1.5;color:' + C.text3 + '">' + foot + '</td></tr>'
    + '</table></td></tr></table></body></html>';
}

function renderText(c, p) {
  const out = [];
  for (const b of c.blocks) {
    if (b.p) out.push(b.p);
    else if (b.steps) out.push(b.steps.map((s, i) => (i + 1) + '. ' + s).join('\n'));
    else if (b.list) out.push(b.list.map((s) => '- ' + s).join('\n'));
    else if (b.button) out.push(b.button.label + ': ' + link(b.button.path));
    else if (b.more) out.push(b.more.label + ': ' + link(b.more.path));
    else if (b.item) out.push(b.item.title + '\n' + b.item.text + (b.item.path ? '\n' + (b.item.cta || 'Open') + ': ' + link(b.item.path) : ''));
    else if (b.note) out.push(b.note);
  }
  const addr = postalAddress();
  out.push('--\nYou’re getting this because you created an OfferReady account with ' + p.email + '.\nUnsubscribe: ' + unsubUrl(p.user_id) + (addr ? '\n' + addr : ''));
  return out.join('\n\n');
}

/** { subject, html, text } for one person and kind, or null for an unknown kind. */
function build(kind, person, update) {
  const c = content(kind, person, update);
  if (!c) return null;
  return { subject: c.subject, html: renderHtml(c, person), text: renderText(c, person) };
}

/** Sends one email with Resend. Returns { ok, id } or { ok: false, status }. */
async function sendEmail(to, msg, userId) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, status: 0 };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const unsub = unsubUrl(userId);
    const body = {
      from: process.env.EMAIL_FROM || 'OfferReady <hello@getofferready.app>',
      to: [to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      headers: { 'List-Unsubscribe': '<' + unsub + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    };
    if (process.env.EMAIL_REPLY_TO) body.reply_to = process.env.EMAIL_REPLY_TO;
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) return { ok: false, status: r.status };
    const j = await r.json().catch(() => ({}));
    return { ok: true, id: j && j.id ? String(j.id).slice(0, 80) : null };
  } catch (_e) {
    return { ok: false, status: 0 };
  } finally { clearTimeout(timer); }
}

/** The small page the unsubscribe link opens. */
function unsubPage(state, userId, token) {
  const action = apiUrl() + '/api/me/plan?op=unsubscribe&u=' + encodeURIComponent(userId) + '&t=' + encodeURIComponent(token);
  const msg = {
    ask: ['Unsubscribe from OfferReady emails?', 'You won’t get welcome, follow-up or monthly update emails. Sign-in and password emails still work.', '<form method="post" action="' + esc(action) + '"><button type="submit" style="font:inherit;font-weight:600;padding:12px 22px;border-radius:10px;border:0;background:' + C.ink + ';color:#fff;cursor:pointer">Unsubscribe</button></form>'],
    done: ['You’re unsubscribed', 'You won’t get any more of these emails. Changed your mind?', '<form method="post" action="' + esc(action + '&undo=1') + '"><button type="submit" style="font:inherit;font-weight:600;padding:10px 18px;border-radius:10px;border:1px solid ' + C.border + ';background:#fff;color:' + C.ink + ';cursor:pointer">Subscribe again</button></form>'],
    back: ['You’re subscribed again', 'Thanks. You’ll get OfferReady emails again.', '<a href="' + esc(appUrl()) + '" style="color:' + C.link + ';font-weight:600">Open OfferReady</a>'],
    bad: ['That link doesn’t work', 'It may be incomplete. Use the unsubscribe link from the latest email, or reply to any email and we’ll take you off the list.', ''],
    later: ['Something went wrong', 'We couldn’t save that just now. Please try the link again in a minute.', ''],
  }[state] || [];
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>OfferReady emails</title></head>'
    + '<body style="margin:0;background:' + C.soft + ';font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Inter,Roboto,Helvetica,Arial,sans-serif;color:' + C.text + '">'
    + '<div style="max-width:460px;margin:48px auto;padding:28px 24px;background:#fff;border:1px solid ' + C.border + ';border-radius:16px">'
    + '<p style="margin:0 0 18px;font-weight:700;color:' + C.ink + '">OfferReady</p>'
    + '<h1 style="margin:0 0 10px;font-size:22px">' + esc(msg[0]) + '</h1>'
    + '<p style="margin:0 0 20px;line-height:1.55;color:' + C.text2 + '">' + esc(msg[1]) + '</p>' + (msg[2] || '')
    + '</div></body></html>';
}

module.exports = {
  KINDS, pickEmail, build, sendEmail, daysSince, monthKey, missingSettings, dailyCap,
  unsubToken, checkUnsubToken, unsubUrl, unsubPage, postalAddress,
};
