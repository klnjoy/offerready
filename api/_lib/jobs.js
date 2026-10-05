/**
 * api/lib/jobs.js — server-side data access for Saved Jobs.
 * ---------------------------------------------------------------------------
 * Reads/writes public.jobs via the Supabase REST API using the SERVICE-ROLE
 * key (bypasses RLS). Every function is scoped by user_id, which the caller
 * gets from a verified JWT (see supabaseAuth.getUser) — so a user can only ever
 * touch their own rows even though the service key bypasses RLS.
 *
 * SECURITY / FAIL-CLOSED:
 *   - Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server-only).
 *   - Any error, missing config, or non-2xx => throws or returns null/[]; the
 *     caller maps that to a safe HTTP response.
 *
 * No external deps (global fetch on the Vercel Node runtime).
 */

'use strict';

const TIMEOUT_MS = 8000;

// Placeholder/junk title values that must NEVER be stored as a job title.
// The AI may return "Not specified"/"Unspecified" for seniority when it can't
// determine a level; passing that straight through produced jobs titled
// "Not specified". We treat these (case-insensitive) as empty.
const JUNK_TITLES = new Set([
  '', 'not specified', 'unspecified', 'n/a', 'na', 'none', 'unknown', 'untitled',
]);

function cleanTitle(v) {
  const s = (v == null ? '' : String(v)).trim();
  if (!s) return '';
  if (JUNK_TITLES.has(s.toLowerCase())) return '';
  return s;
}

/**
 * Derive a meaningful job title, in priority order (spec):
 *   a. Explicit role title the user provided (body.title / body.targetRole)
 *   b. Parsed role title from the analysis (analysis.seniority) — if real
 *   c. AI-derived role title from the analysis role summary (first clause)
 *   d. Fallback "Untitled role" (never "Not specified")
 * Pure + side-effect free so it can be unit-tested. Junk/placeholder values at
 * any level are skipped rather than stored.
 */
function deriveJobTitle(body, analysis) {
  const b = body || {};
  const a = analysis || {};

  // a) explicit role title from the request (candidate-provided)
  const explicit = cleanTitle(b.title) || cleanTitle(b.targetRole);
  if (explicit) return explicit.slice(0, 200);

  // b) parsed role title from analysis (seniority often holds the role/level)
  const parsed = cleanTitle(a.seniority);
  if (parsed) return parsed.slice(0, 200);

  // c) AI-derived role title from the role summary — take the first clause
  //    (up to a sentence/clause boundary) so we get a short title, not a
  //    paragraph. e.g. "Senior AI Engineer who builds RAG systems..." -> title.
  const summary = cleanTitle(a.roleSummary);
  if (summary) {
    const firstClause = summary.split(/[.;:\n\u2014\-]/)[0].trim();
    const candidate = firstClause || summary;
    if (candidate && !JUNK_TITLES.has(candidate.toLowerCase())) {
      return candidate.slice(0, 120);
    }
  }

  // d) fallback — never a placeholder like "Not specified"
  return 'Untitled role';
}

function serviceHeaders(extra) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Object.assign(
    {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    extra || {}
  );
}

function restBase() {
  const url = process.env.SUPABASE_URL;
  if (!url) return null;
  return url.replace(/\/+$/, '') + '/rest/v1';
}

async function restFetch(path, opts) {
  const base = restBase();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('Supabase not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(base + path, Object.assign({ signal: controller.signal }, opts));
  } finally {
    clearTimeout(timer);
  }
}

/** Columns returned for the dashboard list (no heavy analysis/JD payload). */
const LIST_COLS =
  'id,title,company,seniority,skills_count,gaps_count,prep_progress,last_activity_at,created_at,updated_at';

/** List a user's jobs, newest first (summary fields only). */
async function listJobs(userId) {
  if (!userId) return [];
  const qs =
    `user_id=eq.${encodeURIComponent(userId)}` +
    `&select=${LIST_COLS}` +
    `&order=created_at.desc`;
  const resp = await restFetch('/jobs?' + qs, { method: 'GET', headers: serviceHeaders() });
  if (!resp.ok) return [];
  const rows = await resp.json();
  return Array.isArray(rows) ? rows : [];
}

/** Count a user's jobs (for Free-tier limit checks). */
async function countJobs(userId) {
  if (!userId) return 0;
  const qs = `user_id=eq.${encodeURIComponent(userId)}&select=id`;
  const resp = await restFetch('/jobs?' + qs, {
    method: 'GET',
    headers: serviceHeaders({ Prefer: 'count=exact' }),
  });
  if (!resp.ok) return 0;
  // PostgREST returns the count in the Content-Range header: "0-24/123".
  const cr = resp.headers.get('content-range') || '';
  const total = cr.split('/')[1];
  if (total && /^\d+$/.test(total)) return parseInt(total, 10);
  const rows = await resp.json().catch(() => []);
  return Array.isArray(rows) ? rows.length : 0;
}

/** Fetch one full job by id, scoped to the owner. Null if not found/owned. */
async function getJob(userId, id) {
  if (!userId || !id) return null;
  const qs =
    `id=eq.${encodeURIComponent(id)}` +
    `&user_id=eq.${encodeURIComponent(userId)}` +
    `&select=*&limit=1`;
  const resp = await restFetch('/jobs?' + qs, { method: 'GET', headers: serviceHeaders() });
  if (!resp.ok) return null;
  const rows = await resp.json();
  return (Array.isArray(rows) && rows[0]) || null;
}

/** Insert a new job for the user. Returns the created row (summary), or null. */
async function insertJob(userId, row) {
  if (!userId) return null;
  const payload = Object.assign({}, row, { user_id: userId });
  const resp = await restFetch('/jobs', {
    method: 'POST',
    headers: serviceHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(payload),
  });
  if (!resp.ok) return null;
  const rows = await resp.json();
  return (Array.isArray(rows) && rows[0]) || null;
}

/** Delete one job, scoped to the owner. Returns true on success. */
async function deleteJob(userId, id) {
  if (!userId || !id) return false;
  const qs =
    `id=eq.${encodeURIComponent(id)}` +
    `&user_id=eq.${encodeURIComponent(userId)}`;
  const resp = await restFetch('/jobs?' + qs, { method: 'DELETE', headers: serviceHeaders() });
  return resp.ok;
}

module.exports = { listJobs, countJobs, getJob, insertJob, deleteJob, deriveJobTitle, cleanTitle };
