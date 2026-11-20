'use strict';
const test = require('node:test');
const assert = require('node:assert');
const re = require('../_lib/roleEmails');
const emails = require('../_lib/emails');

const NOW = Date.parse('2026-11-20T15:00:00Z');
const H = 3600000;
const RESUME = 'Data engineer for 6 years. Python and SQL daily; built Airflow DAGs and dbt models on Snowflake. Some Kafka streaming.';
const role = (id, title, tags, hoursAgo, country = 'US') => ({ id, title, company: 'Co ' + id, location: 'Remote, US', posted: new Date(NOW - hoursAgo * H).toISOString(), country, tags });
const FEED = [
  role('a', 'Data Engineer', ['Python', 'SQL', 'Airflow'], 5),
  role('b', 'Analytics Engineer', ['SQL', 'dbt'], 10),
  role('c', 'Backend Engineer', ['Java', 'Kafka'], 2),        // Java not in resume
  role('d', 'Streaming Engineer', ['Kafka'], 100),            // too old (beyond 3-day floor)
  role('e', 'Data Engineer, Berlin', ['Python', 'SQL'], 1, 'DE'),
  role('f', 'Untagged role', [], 1),
];
const person = (extra) => Object.assign({ user_id: 'u', email: 'a@example.com', cc: 'US', optin_at: new Date(NOW - 30 * 24 * H).toISOString(), resume: RESUME, last_sent: null, sent: [] }, extra || {});

test('skillsInResume matches whole words, case-insensitive', () => {
  assert.deepStrictEqual(re.skillsInResume(['Python', 'SQL', 'Go', 'C'], 'I write python and sql. I go home.'), ['Python', 'SQL', 'Go']);
  assert.deepStrictEqual(re.skillsInResume(['dbt'], 'dbtx'), []);
});

test('pickRoles: new strongest matches in the country, newest first, once a day', () => {
  const p = re.pickRoles(person(), FEED, NOW);
  assert.strictEqual(p.kind, 'roles:2026-11-20');
  assert.deepStrictEqual(p.roles.map((r) => r.id), ['a', 'b']);
  assert.strictEqual(p.total, 2);
  assert.strictEqual(re.pickRoles(person({ sent: ['roles:2026-11-20'] }), FEED, NOW), null);
  // Any country.
  assert.deepStrictEqual(re.pickRoles(person({ cc: '' }), FEED, NOW).roles.map((r) => r.id), ['e', 'a', 'b']);
});

test('pickRoles: only roles posted since the last digest; none → no email', () => {
  assert.deepStrictEqual(re.pickRoles(person({ last_sent: new Date(NOW - 7 * H).toISOString() }), FEED, NOW).roles.map((r) => r.id), ['a']);
  assert.strictEqual(re.pickRoles(person({ last_sent: new Date(NOW - 1 * H).toISOString() }), FEED, NOW), null);
  // Turned on an hour ago: only what's newer.
  assert.strictEqual(re.pickRoles(person({ optin_at: new Date(NOW - 1 * H).toISOString() }), FEED, NOW), null);
});

test('pickRoles: no synced resume, no email', () => {
  assert.strictEqual(re.pickRoles(person({ resume: null }), FEED, NOW), null);
  assert.strictEqual(re.pickRoles(person({ resume: 'Python' }), FEED, NOW), null);
});

test('at most 8 roles listed, the total counts them all', () => {
  const many = Array.from({ length: 11 }, (_, i) => role('m' + i, 'Data Engineer ' + i, ['Python'], i + 1));
  const p = re.pickRoles(person(), many, NOW);
  assert.strictEqual(p.roles.length, re.MAX_LISTED);
  assert.strictEqual(p.total, 11);
  const msg = emails.build(p.kind, Object.assign(person(), { first_name: 'Ann', roles: p.roles, roles_total: p.total }), null);
  assert.strictEqual(msg.subject, '11 new roles that match your resume');
  assert.match(msg.html, /See all 11 in Open roles/);
  assert.match(msg.html, /\/interviews\/co-m0\/data-engineer-0/);
  assert.match(msg.text, /Turn it off any time in Account/);
});

test('one match reads singular; no roles builds nothing', () => {
  const msg = emails.build('roles:2026-11-20', Object.assign(person(), { roles: [FEED[0]], roles_total: 1 }), null);
  assert.strictEqual(msg.subject, 'A new role that matches your resume');
  assert.strictEqual(emails.build('roles:2026-11-20', Object.assign(person(), { roles: [] }), null), null);
});

test('rolePath matches the app scheme', () => {
  assert.strictEqual(re.rolePath({ company: 'Acme & Co.', title: 'C++ Engineer (Remote)' }), '/interviews/acme-and-co/c-plus-plus-engineer-remote');
});

test('rolesOn only with EMAIL_ROLES=on', () => {
  delete process.env.EMAIL_ROLES;
  assert.strictEqual(re.rolesOn(), false);
  process.env.EMAIL_ROLES = 'on';
  assert.strictEqual(re.rolesOn(), true);
  delete process.env.EMAIL_ROLES;
});
