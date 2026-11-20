/**
 * New-role match emails: which new roles in the public feed match someone's
 * resume. Same rule as Open roles' "strongest matches": the resume names every
 * skill the role lists. Pure functions plus a feed fetch; the email itself is
 * built by lib/emails.js (kind 'roles:YYYY-MM-DD').
 */

'use strict';

/** Skills (tags) the resume text names, as in the app's savedResume.skillsInResume. */
function skillsInResume(skills, text) {
  const hay = String(text || '').toLowerCase();
  return (skills || []).filter((s) => {
    const t = String(s || '').trim().toLowerCase();
    if (t.length < 2) return false;
    const e = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^a-z0-9])' + e + '([^a-z0-9]|$)', 'i').test(hay);
  });
}

/** Most roles listed in one email. */
const MAX_LISTED = 8;

/**
 * The new strongest-match roles for one person: posted after `since`, in their
 * country ('' = any), every listed skill in the resume. Newest first.
 */
function newMatches(roles, person, since) {
  const resume = String(person.resume || '');
  if (resume.trim().length < 50) return [];
  const t0 = since ? new Date(since).getTime() : 0;
  const cc = String(person.cc || '').toUpperCase();
  return (roles || [])
    .filter((r) => {
      const posted = Date.parse(r.posted || '');
      if (!posted || posted <= t0) return false;
      if (cc && String(r.country || '').toUpperCase() !== cc) return false;
      const tags = r.tags || [];
      return tags.length > 0 && skillsInResume(tags, resume).length === tags.length;
    })
    .sort((a, b) => Date.parse(b.posted) - Date.parse(a.posted));
}

/**
 * Today's digest for someone who opted in, or null: at most one a day, only
 * with new strongest matches since the last digest (or since they turned it
 * on, looking back at most 3 days).
 * Returns { kind, roles, total } with roles cut to MAX_LISTED.
 */
function pickRoles(person, roles, now) {
  if (!person) return null;
  const kind = 'roles:' + new Date(now).toISOString().slice(0, 10);
  if ((person.sent || []).includes(kind)) return null;
  const floor = now - 3 * 86400000;
  const since = Math.max(floor, Date.parse(person.last_sent || '') || 0, Date.parse(person.optin_at || '') || 0);
  const all = newMatches(roles, person, since);
  if (!all.length) return null;
  return { kind, roles: all.slice(0, MAX_LISTED), total: all.length };
}

/** The public roles feed the app builds (Open roles). [] when it can't be read. */
async function fetchRoles() {
  const url = process.env.ROLES_FEED_URL || 'https://getofferready.app/roles.json';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) return [];
    const body = await r.json();
    return Array.isArray(body && body.roles) ? body.roles : [];
  } catch (_e) {
    return [];
  } finally { clearTimeout(timer); }
}

/** The role's page in the app (same scheme as the app's roleSlug.rolePath). */
function slugify(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/\+/g, ' plus ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 80).replace(/-+$/, '') || 'role';
}
function rolePath(r) { return '/interviews/' + slugify(r.company) + '/' + slugify(r.title); }

function rolesOn() { return String(process.env.EMAIL_ROLES || '').toLowerCase() === 'on'; }

module.exports = { skillsInResume, newMatches, pickRoles, fetchRoles, rolePath, slugify, rolesOn, MAX_LISTED };
