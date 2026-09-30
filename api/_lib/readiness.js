/**
 * api/_lib/readiness.js — server-side persistence for the job-rooted readiness
 * data (gap analysis, generated questions, progress metrics).
 * ---------------------------------------------------------------------------
 * Every row belongs to a job (job_id) AND a user (user_id). Writes use the
 * Supabase SERVICE-ROLE key (bypasses RLS) but ALWAYS scope by user_id, which
 * the caller derives from a verified JWT — so a user can only ever touch their
 * own rows. Mirrors the conventions in _lib/jobs.js.
 *
 * SECURITY / FAIL-CLOSED:
 *   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server-only).
 *   - ownsJob() must pass before any write attributes data to a job_id.
 *   - Any error / missing config / non-2xx => null/[]/false; callers map that
 *     to a safe HTTP response.
 *
 * No external deps (global fetch on the Vercel Node runtime).
 */

'use strict';

const TIMEOUT_MS = 8000;

function serviceHeaders(extra) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Object.assign(
    { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
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

const enc = encodeURIComponent;

/** True iff `jobId` exists and is owned by `userId`. Fail-closed. */
async function ownsJob(userId, jobId) {
  if (!userId || !jobId) return false;
  try {
    const qs = `id=eq.${enc(jobId)}&user_id=eq.${enc(userId)}&select=id&limit=1`;
    const resp = await restFetch('/jobs?' + qs, { method: 'GET', headers: serviceHeaders() });
    if (!resp.ok) return false;
    const rows = await resp.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch (_e) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// gap_analysis — one latest row per job (we replace on re-run).
// ---------------------------------------------------------------------------

/**
 * Upsert-by-replace: delete prior gap rows for this job, insert the new one.
 * `result` is the validated gap object (matchScore + sub-scores + arrays).
 * Returns the saved row or null.
 */
async function saveGapAnalysis(userId, jobId, result, model) {
  if (!userId || !jobId || !result) return null;
  const row = {
    user_id: userId,
    job_id: jobId,
    match_score: int(result.matchScore),
    technical_score: int(result.technicalScore),
    behavioral_score: int(result.behavioralScore),
    architecture_score: int(result.architectureScore),
    domain_score: int(result.domainScore),
    result: result,
    model: model || null,
  };
  try {
    // Keep one gap row per job: remove old ones first.
    await restFetch(`/gap_analysis?job_id=eq.${enc(jobId)}&user_id=eq.${enc(userId)}`,
      { method: 'DELETE', headers: serviceHeaders() });
    const resp = await restFetch('/gap_analysis', {
      method: 'POST',
      headers: serviceHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(row),
    });
    if (!resp.ok) return null;
    const rows = await resp.json();
    return (Array.isArray(rows) && rows[0]) || null;
  } catch (_e) {
    return null;
  }
}

/** Latest gap_analysis row for a job (or null). */
async function getGapAnalysis(userId, jobId) {
  if (!userId || !jobId) return null;
  try {
    const qs = `job_id=eq.${enc(jobId)}&user_id=eq.${enc(userId)}` +
      `&select=*&order=created_at.desc&limit=1`;
    const resp = await restFetch('/gap_analysis?' + qs, { method: 'GET', headers: serviceHeaders() });
    if (!resp.ok) return null;
    const rows = await resp.json();
    return (Array.isArray(rows) && rows[0]) || null;
  } catch (_e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// questions — the generated set for a job (we replace the whole set on re-gen).
// ---------------------------------------------------------------------------

/**
 * Replace this job's question set with `questions` (array of {category,
 * difficulty, prompt, model_answer?, signals?}). Returns the count saved.
 */
async function saveQuestions(userId, jobId, questions) {
  if (!userId || !jobId || !Array.isArray(questions) || !questions.length) return 0;
  const rows = questions.slice(0, 40).map((q, i) => ({
    user_id: userId,
    job_id: jobId,
    category: String(q.category || 'technical').slice(0, 40),
    difficulty: String(q.difficulty || 'medium').slice(0, 20),
    prompt: String(q.prompt || '').slice(0, 600),
    model_answer: q.model_answer ? String(q.model_answer).slice(0, 2000) : null,
    signals: Array.isArray(q.signals) ? q.signals : [],
    sort_order: i,
  }));
  try {
    await restFetch(`/questions?job_id=eq.${enc(jobId)}&user_id=eq.${enc(userId)}`,
      { method: 'DELETE', headers: serviceHeaders() });
    const resp = await restFetch('/questions', {
      method: 'POST',
      headers: serviceHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify(rows),
    });
    return resp.ok ? rows.length : 0;
  } catch (_e) {
    return 0;
  }
}

/** All questions for a job, ordered (or []). */
async function getQuestions(userId, jobId) {
  if (!userId || !jobId) return [];
  try {
    const qs = `job_id=eq.${enc(jobId)}&user_id=eq.${enc(userId)}` +
      `&select=category,difficulty,prompt,model_answer,signals,sort_order&order=sort_order.asc`;
    const resp = await restFetch('/questions?' + qs, { method: 'GET', headers: serviceHeaders() });
    if (!resp.ok) return [];
    const rows = await resp.json();
    return Array.isArray(rows) ? rows : [];
  } catch (_e) {
    return [];
  }
}

// ---------------------------------------------------------------------------
// progress_metrics — append-only snapshots per job (for the readiness trend).
// ---------------------------------------------------------------------------

/** Insert a readiness snapshot for a job. Returns the row or null. */
async function saveProgressSnapshot(userId, jobId, snap) {
  if (!userId || !jobId || !snap) return null;
  const row = {
    user_id: userId,
    job_id: jobId,
    overall_readiness: int(snap.overall),
    technical_score: int(snap.technical),
    behavioral_score: int(snap.behavioral),
    architecture_score: int(snap.architecture),
    domain_score: int(snap.domain),
    questions_practiced: int(snap.questionsPracticed),
    avg_answer_score: int(snap.avgAnswerScore),
    detail: snap.detail || {},
  };
  try {
    const resp = await restFetch('/progress_metrics', {
      method: 'POST',
      headers: serviceHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(row),
    });
    if (!resp.ok) return null;
    const rows = await resp.json();
    return (Array.isArray(rows) && rows[0]) || null;
  } catch (_e) {
    return null;
  }
}

/** Progress snapshots for a job, newest first (capped). */
async function getProgress(userId, jobId, limit) {
  if (!userId || !jobId) return [];
  try {
    const qs = `job_id=eq.${enc(jobId)}&user_id=eq.${enc(userId)}` +
      `&select=*&order=recorded_at.desc&limit=${int(limit) || 30}`;
    const resp = await restFetch('/progress_metrics?' + qs, { method: 'GET', headers: serviceHeaders() });
    if (!resp.ok) return [];
    const rows = await resp.json();
    return Array.isArray(rows) ? rows : [];
  } catch (_e) {
    return [];
  }
}

function int(v) {
  const n = Math.round(Number(v));
  return isFinite(n) ? n : 0;
}

module.exports = {
  ownsJob,
  saveGapAnalysis, getGapAnalysis,
  saveQuestions, getQuestions,
  saveProgressSnapshot, getProgress,
};
