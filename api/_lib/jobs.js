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

module.exports = { listJobs, countJobs, getJob, insertJob, deleteJob };
