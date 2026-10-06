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

// Role-noun vocabulary used to pull an actual job title out of a free-form
// role summary. The AI's roleSummary is a paragraph that frequently OPENS with
// a company description ("Datavations is a data and AI software company ...").
// Taking the first clause of that produced company-blurb "titles", so instead
// we look for a role phrase anywhere in the text.
const ROLE_NOUNS = [
  'engineer', 'architect', 'developer', 'scientist', 'analyst', 'administrator',
  'consultant', 'designer', 'specialist', 'manager', 'lead', 'director',
  'programmer', 'strategist', 'researcher',
];
const ROLE_NOUNS_SET = new Set(ROLE_NOUNS);
// Phrases that signal a clause is describing the COMPANY, not the role.
const COMPANY_HINT = /\b(is a|is an|we are|we're|company|startup|founded|headquarter|our mission|our team|about us|organization|organisation)\b/i;
// Lowercase words that may NOT lead a role title (articles, verbs, connectors,
// company-ish nouns). The qualifier walk stops when it hits one of these.
const ROLE_STOP = new Set([
  'a', 'an', 'the', 'our', 'their', 'your', 'this', 'that', 'for', 'of', 'to',
  'and', 'or', 'as', 'with', 'is', 'are', 'be', 'seeking', 'hiring', 'seeks',
  'looking', 'need', 'needs', 'wants', 'want', 'join', 'join', 'company',
  'startup', 'team', 'role', 'position', 'who', 'that', 'experienced', 'strong',
]);

// A token is a usable role QUALIFIER if it starts uppercase (Azure, Databricks,
// Data, Senior, Staff) or is a known seniority/level word. We build the title
// from the role noun walking left over such qualifiers, stopping at a stop-word
// or a non-qualifier token so we get "Azure Data Engineer", not
// "company seeking an Azure Data Engineer" or "The Azure Data Engineer".
const SENIORITY_WORDS = new Set([
  'senior', 'junior', 'staff', 'principal', 'lead', 'head', 'chief', 'mid',
]);
function isQualifier(tok) {
  if (!tok) return false;
  const bare = tok.replace(/[^A-Za-z0-9+/.#-]/g, '');
  if (!bare) return false;
  if (ROLE_STOP.has(bare.toLowerCase())) return false;
  if (/^[A-Z]/.test(bare)) return true;             // capitalized: Azure, Data, Databricks
  if (SENIORITY_WORDS.has(bare.toLowerCase())) return true;
  return false;
}

// Does a string contain an actual role noun (engineer/architect/...)? Used to
// reject a bare seniority level ("Senior") as a standalone title.
function hasRoleNoun(s) {
  const words = String(s == null ? '' : s).toLowerCase().split(/[^a-z]+/);
  return words.some((w) => w && (ROLE_NOUNS_SET.has(w) || ROLE_NOUNS_SET.has(w.replace(/s$/, ''))));
}

// If a string is ONLY a seniority level (e.g. "Senior", "Staff", "Senior/Lead")
// with no role noun, return the cleaned level to use as a prefix; else ''.
function bareSeniority(s) {
  const str = String(s == null ? '' : s).trim();
  if (!str || hasRoleNoun(str)) return '';
  const words = str.split(/[\s/]+/).filter(Boolean);
  if (words.length && words.every((w) => SENIORITY_WORDS.has(w.toLowerCase()))) {
    const lvl = words[0];
    return lvl.charAt(0).toUpperCase() + lvl.slice(1).toLowerCase();
  }
  return '';
}

/**
 * Try to extract a concise role TITLE from a free-form role summary.
 * Returns '' when no confident role phrase is found. Pure/side-effect free.
 *
 * Approach: tokenize, find a role noun (engineer/architect/...), then walk LEFT
 * collecting immediately-preceding qualifier tokens (capitalized words or
 * seniority words), stopping at a stop-word/article. This yields
 * "Senior Azure Data Engineer" and strips leading "The"/"company seeking an".
 * Clauses that read as a company description are tried last.
 */
function extractRoleFromSummary(summary) {
  const text = (summary == null ? '' : String(summary)).trim();
  if (!text) return '';

  function fromClause(clause) {
    const raw = clause.trim();
    if (!raw) return '';
    const tokens = raw.split(/\s+/);
    for (let i = 0; i < tokens.length; i++) {
      const bare = tokens[i].replace(/[^A-Za-z]/g, '').toLowerCase();
      const singular = bare.replace(/s$/, '');
      if (ROLE_NOUNS_SET.has(bare) || ROLE_NOUNS_SET.has(singular)) {
        // Walk left over qualifier tokens.
        let start = i;
        while (start - 1 >= 0 && isQualifier(tokens[start - 1])) start--;
        // Require at least one qualifier so a bare "engineer" (too generic)
        // isn't returned on its own.
        if (start === i) continue;
        const phrase = tokens.slice(start, i + 1).join(' ')
          .replace(/[^A-Za-z0-9+/.#\- ]/g, '').trim();
        const cand = cleanTitle(phrase);
        if (cand) return cand.slice(0, 120);
      }
    }
    return '';
  }

  // Prefer clauses that are NOT company descriptions.
  const clauses = text.split(/[.;:\n\u2014]|,\s(?=[A-Z])/);
  for (const clause of clauses) {
    if (COMPANY_HINT.test(clause)) continue;
    const r = fromClause(clause);
    if (r) return r;
  }
  // Last resort: allow company-ish clauses too (the role noun + qualifiers walk
  // already strips the "company seeking an" lead-in).
  for (const clause of clauses) {
    const r = fromClause(clause);
    if (r) return r;
  }
  return '';
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

  // b) parsed role title from analysis.seniority — ONLY when it already
  //    contains a role noun (e.g. "Senior Data Engineer"). A bare level like
  //    "Senior" is NOT a title on its own; we keep it as a prefix for (c).
  const parsed = cleanTitle(a.seniority);
  if (parsed && hasRoleNoun(parsed)) return parsed.slice(0, 200);
  const levelPrefix = bareSeniority(a.seniority); // "Senior" / "" (no role noun)

  // c) AI-derived role title from the role summary. The summary is a paragraph
  //    that often OPENS with a company description, so we extract an actual
  //    role phrase (e.g. "Data Engineer") rather than blindly taking the first
  //    clause. If analysis.seniority was a bare level, prepend it so we persist
  //    the COMPLETE role (e.g. "Senior" + "Data Engineer" => "Senior Data
  //    Engineer") instead of losing the role noun.
  const role = extractRoleFromSummary(a.roleSummary);
  if (role) {
    // Avoid doubling the level if the extracted phrase already starts with it.
    const alreadyLeveled = levelPrefix
      && role.toLowerCase().startsWith(levelPrefix.toLowerCase());
    const full = (levelPrefix && !alreadyLeveled) ? (levelPrefix + ' ' + role) : role;
    return full.slice(0, 120);
  }

  // d) fallback — never a placeholder like "Not specified", never a bare
  //    seniority level, never a company-description sentence.
  return 'Untitled role';
}

/**
 * Normalize a job's role context into an internal scenario role FAMILY (spec
 * §5). Pure/testable mirror of the client inferScenarioCategory (analyze.js):
 * matching uses the COMPLETE context (title + summary + skills + technologies),
 * never seniority alone. Returns one of the catalog family keys or '' when no
 * confident family is found (so the UI shows no forced filter / asks).
 *
 * ctx: { title, roleSummary, skills:[], technologies:[], seniority } (any subset)
 */
function normalizeRoleFamily(ctx) {
  const c = ctx || {};
  const hay = [
    c.title || '',
    c.roleSummary || '',
    (Array.isArray(c.skills) ? c.skills : []).map((s) => (typeof s === 'string' ? s : (s && s.name) || '')).join(' '),
    (Array.isArray(c.technologies) ? c.technologies : []).join(' '),
    // seniority is included for context but can NEVER by itself pick a family
    // (none of the family patterns match a bare level word).
    c.seniority || '',
  ].join(' ').toLowerCase();

  if (/\bsecurity|prompt injection|guardrail|threat|owasp|zero.?trust\b/.test(hay)) return 'ai-security';
  if (/\bforward deployed|forward-deployed|\bfde\b|customer-facing|client-facing|solutions engineer\b/.test(hay)) return 'fde';
  // Data Engineering BEFORE Data Architecture (spec): a Data Engineer must not
  // default to the Data Architect family.
  if (/\bdata engineer|data engineering|azure data|data platform engineer|databricks|spark|pipeline|data pipeline|etl|elt|ingestion|streaming|real-?time|data quality|lakehouse|airflow|dbt\b/.test(hay)) return 'data-engineer';
  if (/\bdata architect|analytics architect|snowflake|warehouse|warehousing|cortex|data platform|analytics engineer|data modeling|dimensional\b/.test(hay)) return 'data-architect';
  if (/\bcloud|platform|devops|kubernetes|infrastructure|sre|reliability|terraform\b/.test(hay)) return 'cloud-platform';
  if (/\barchitect|architecture|system design|multi-tenant|enterprise\b/.test(hay)) return 'ai-architect';
  if (/\bai engineer|genai|ml engineer|rag|agent|llm|nlp\b/.test(hay)) return 'ai-engineer';
  return '';
}

// Minimum JD length the Gap form requires before "Analyze Gap" will run.
// Mirrors the client-side guard in content/assets/gap.js so the restore
// contract is testable in one place.
const GAP_MIN_JD = 30;

/**
 * Compute what a saved job restores into the Check My Fit (Gap Analysis) form.
 * Pure + side-effect free so the restore contract is unit-testable without a
 * browser. The client (gap.js) mirrors this: Target Role from the title, Job
 * Description from the stored job_description (falling back to the analysis
 * role summary), and whether "Analyze Gap" can run from the saved context
 * alone (JD long enough) — meaning the user only needs to add a resume.
 *
 * IMPORTANT: the /api/jobs LIST rows are light (no job_description/analysis),
 * so a full job (from /api/jobs/:id) must be passed here to restore the JD.
 *
 * @param {object} job - a FULL saved-job row (title, job_description, analysis)
 * @returns {{title:string, role:string, jd:string, canAnalyze:boolean}}
 */
function restoreJobContext(job) {
  const j = job || {};
  const title = cleanTitle(j.title) || (j.title ? String(j.title) : '');
  const role = title;

  let jd = '';
  if (j.job_description != null && String(j.job_description).trim()) {
    jd = String(j.job_description).trim();
  } else if (j.analysis && j.analysis.roleSummary != null && String(j.analysis.roleSummary).trim()) {
    jd = String(j.analysis.roleSummary).trim();
  }

  return {
    title: title,
    role: role,
    jd: jd,
    // Only the resume is still required when this is true.
    canAnalyze: jd.length >= GAP_MIN_JD,
  };
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

/**
 * Patch selected fields on a job, scoped to the owner. `fields` is a plain
 * object of column -> value. Returns the updated row or null. Never trusts a
 * client user_id (always filters by the server-derived userId).
 */
async function updateJobFields(userId, id, fields) {
  if (!userId || !id || !fields || typeof fields !== 'object') return null;
  const keys = Object.keys(fields);
  if (!keys.length) return null;
  const qs =
    `id=eq.${encodeURIComponent(id)}` +
    `&user_id=eq.${encodeURIComponent(userId)}`;
  const resp = await restFetch('/jobs?' + qs, {
    method: 'PATCH',
    headers: serviceHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(fields),
  });
  if (!resp.ok) return null;
  const rows = await resp.json().catch(() => []);
  return (Array.isArray(rows) && rows[0]) || null;
}

/**
 * Keep the lightweight jobs-list columns truthful after job-scoped records are
 * persisted. The My Jobs card reads gaps_count / prep_progress from the jobs
 * row (the list endpoint stays light), so without this they go stale: a
 * persisted Gap Analysis wouldn't update gaps_count, and generating questions
 * or completing practice wouldn't move prep_progress off 0.
 *
 * This is a best-effort SYNC of already-persisted facts — not a new feature and
 * not a readiness formula. `stats` may carry any of:
 *   - gapsCount   (number)  -> gaps_count
 *   - prepProgress(number)  -> prep_progress (clamped 0-100)
 * Only provided keys are written. Returns the updated row or null.
 */
async function touchJobStats(userId, id, stats) {
  if (!userId || !id || !stats) return null;
  const fields = {};
  if (typeof stats.gapsCount === 'number' && isFinite(stats.gapsCount)) {
    fields.gaps_count = Math.max(0, Math.round(stats.gapsCount));
  }
  if (typeof stats.prepProgress === 'number' && isFinite(stats.prepProgress)) {
    fields.prep_progress = Math.max(0, Math.min(100, Math.round(stats.prepProgress)));
  }
  if (!Object.keys(fields).length) return null;
  fields.updated_at = new Date().toISOString();
  return updateJobFields(userId, id, fields);
}

// A stored title is "weak" (eligible for repair-on-reopen) when it is empty, a
// junk placeholder, a bare seniority level, OR looks like a company-description
// sentence rather than a role. Used ONLY to repair a job's own persisted title
// from its own persisted analysis when it is reopened — never a blanket
// backfill, never overwriting a good/user-edited title.
function isWeakTitle(title) {
  const s = cleanTitle(title);
  if (!s) return true;                       // '', 'Not specified', junk
  if (bareSeniority(s)) return true;         // 'Senior' alone
  if (!hasRoleNoun(s)) return true;          // no role noun => not a real title
  if (s.length > 80) return true;            // paragraph-length => not a title
  if (COMPANY_HINT.test(s)) return true;     // 'X is a ... company ...'
  return false;
}

/**
 * Repair a job's title ONLY when it is weak and a reliable role can be derived
 * from the job's own persisted analysis. Returns the repaired title string if a
 * better one was derived AND it differs from the stored title; else ''. Pure
 * (no I/O) so the caller decides whether to persist.
 */
function repairedTitleFor(job) {
  const j = job || {};
  if (!isWeakTitle(j.title)) return '';      // preserve good / user-edited titles
  // Derive from the job's own analysis (no body.title/targetRole available on
  // a reopen) using the same precedence as a fresh save.
  const derived = deriveJobTitle({}, j.analysis || {});
  if (!derived || derived === 'Untitled role') return '';   // no reliable role
  if (isWeakTitle(derived)) return '';       // don't replace one weak guess with another
  if (cleanTitle(derived) === cleanTitle(j.title)) return '';
  return derived;
}

module.exports = {
  listJobs, countJobs, getJob, insertJob, deleteJob,
  deriveJobTitle, cleanTitle, restoreJobContext, GAP_MIN_JD,
  extractRoleFromSummary, normalizeRoleFamily,
  updateJobFields, touchJobStats, isWeakTitle, repairedTitleFor,
};
