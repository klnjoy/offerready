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

/**
 * Insert a readiness snapshot for a job (append-only trend point).
 * snap may carry:
 *   - source: 'gap_analysis_completed' | 'practice_session_completed'
 *   - dedupeKey: idempotency key. When present we upsert on
 *     (user_id, job_id, dedupe_key) so retries never append a duplicate point.
 * Returns the row or null. Requires the 0006 columns (source, dedupe_key) when
 * a dedupeKey is supplied; without 0006 the on_conflict target won't exist and
 * the write fails closed (null) rather than silently duplicating.
 */
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
  if (snap.source) row.source = String(snap.source).slice(0, 60);
  if (snap.dedupeKey) row.dedupe_key = String(snap.dedupeKey).slice(0, 200);
  try {
    // With a dedupe key, resolve on the unique index (idempotent). The
    // merge-duplicates preference means a retry updates the same trend point
    // instead of creating a second one.
    const path = snap.dedupeKey
      ? '/progress_metrics?on_conflict=user_id,job_id,dedupe_key'
      : '/progress_metrics';
    const prefer = snap.dedupeKey
      ? 'return=representation,resolution=merge-duplicates'
      : 'return=representation';
    const resp = await restFetch(path, {
      method: 'POST',
      headers: serviceHeaders({ Prefer: prefer }),
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

// ---------------------------------------------------------------------------
// practice_sessions — job-scoped practice completions (Phase 1.5).
// Writes go through the authenticated /api/jobs/:id endpoint; the user_id and
// job_id are set from the verified JWT + ownership-checked route, never trusted
// from the client. Idempotent on (user_id, job_id, session_id).
// ---------------------------------------------------------------------------

function clamp(n, lo, hi) {
  const v = Math.round(Number(n));
  if (!isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Insert (or idempotently upsert) a completed practice session for a job.
 * `session` fields are already validated by the caller. Returns the saved row
 * or null. Requires the 0006 columns (job_id, session_id).
 */
async function savePracticeSession(userId, jobId, session) {
  if (!userId || !jobId || !session) return null;
  const row = {
    user_id: userId,
    job_id: jobId,
    session_id: session.sessionId ? String(session.sessionId).slice(0, 200) : null,
    content_slug: session.contentSlug ? String(session.contentSlug).slice(0, 200) : null,
    category: session.category ? String(session.category).slice(0, 60) : null,
    mode: session.mode ? String(session.mode).slice(0, 40) : null,
    score: clamp(session.score, 0, 100),
    completed: session.completed === false ? false : true,
    completed_at: session.completedAt || new Date().toISOString(),
  };
  try {
    const path = row.session_id
      ? '/practice_sessions?on_conflict=user_id,job_id,session_id'
      : '/practice_sessions';
    const prefer = row.session_id
      ? 'return=representation,resolution=merge-duplicates'
      : 'return=representation';
    const resp = await restFetch(path, {
      method: 'POST',
      headers: serviceHeaders({ Prefer: prefer }),
      body: JSON.stringify(row),
    });
    if (!resp.ok) return null;
    const rows = await resp.json();
    return (Array.isArray(rows) && rows[0]) || null;
  } catch (_e) {
    return null;
  }
}

/**
 * Recent completed practice sessions for a job, newest first (capped).
 * Scoped by user_id AND job_id — legacy null-job rows are naturally excluded
 * because they don't match job_id=eq.<jobId>.
 */
async function getPracticeSessions(userId, jobId, limit) {
  if (!userId || !jobId) return [];
  try {
    const qs = `job_id=eq.${enc(jobId)}&user_id=eq.${enc(userId)}` +
      `&select=id,category,mode,content_slug,score,completed,completed_at` +
      `&order=completed_at.desc&limit=${int(limit) || 10}`;
    const resp = await restFetch('/practice_sessions?' + qs, { method: 'GET', headers: serviceHeaders() });
    if (!resp.ok) return [];
    const rows = await resp.json();
    return Array.isArray(rows) ? rows : [];
  } catch (_e) {
    return [];
  }
}

/**
 * Compute the current readiness for a job from SERVER-LOADED records only
 * (never from client-submitted scores). Mirrors the client weightedOverall():
 *   overall = 0.5*match + 0.3*practiceAvg + 0.2*completion
 * practiceAvg = mean score of completed practice sessions (0-100).
 * completion  = min(sessions, 10) * 10  (reps-based completion proxy, 0-100).
 * Sub-scores derive from the gap row, nudged by practiceAvg when present.
 * Returns a snapshot-shaped object { overall, technical, behavioral,
 * architecture, domain, questionsPracticed, avgAnswerScore, detail }.
 */
function computeReadiness(gap, practiceSessions) {
  const sessions = Array.isArray(practiceSessions) ? practiceSessions : [];
  const completedScores = sessions
    .filter((s) => s && s.completed !== false && s.score != null)
    .map((s) => clamp(s.score, 0, 100));
  const practiceCount = completedScores.length;
  const practiceAvg = practiceCount
    ? Math.round(completedScores.reduce((a, b) => a + b, 0) / practiceCount)
    : 0;
  const completion = Math.min(practiceCount, 10) * 10;
  const match = gap ? int(gap.match_score) : 0;

  const overall = (!gap && !practiceAvg)
    ? 0
    : clamp(0.5 * match + 0.3 * practiceAvg + 0.2 * completion, 0, 100);

  const sub = (base) => {
    if (!gap && !practiceAvg) return 0;
    const b = int(base);
    return clamp(practiceAvg ? 0.7 * b + 0.3 * practiceAvg : b, 0, 100);
  };

  return {
    overall,
    technical: sub(gap && gap.technical_score),
    behavioral: sub(gap && gap.behavioral_score),
    architecture: sub(gap && gap.architecture_score),
    domain: sub(gap && gap.domain_score),
    questionsPracticed: practiceCount,
    avgAnswerScore: practiceAvg,
    detail: { match_score: match, practice_count: practiceCount },
  };
}

/**
 * Atomic practice completion via the Postgres RPC public.complete_practice
 * (added in migration 0006). Records the practice session AND the readiness
 * snapshot in ONE transaction, so the "session saved but snapshot missing"
 * partial state cannot occur. Returns { session, snapshot, readiness } on
 * success, or null if the RPC is unavailable / errored (caller then falls back
 * to the two-step savePracticeSession + saveProgressSnapshot path).
 *
 * Ownership is re-verified inside the function; we still pass the server-
 * derived userId + the ownership-checked jobId (never client-trusted).
 */
async function completePracticeAtomic(userId, jobId, session) {
  if (!userId || !jobId || !session || !session.sessionId) return null;
  const args = {
    p_user_id: userId,
    p_job_id: jobId,
    p_session_id: String(session.sessionId).slice(0, 200),
    p_category: session.category ? String(session.category).slice(0, 60) : null,
    p_mode: session.mode ? String(session.mode).slice(0, 40) : null,
    p_content_slug: session.contentSlug ? String(session.contentSlug).slice(0, 200) : null,
    p_score: clamp(session.score, 0, 100),
    p_completed_at: session.completedAt || new Date().toISOString(),
  };
  try {
    const resp = await restFetch('/rpc/complete_practice', {
      method: 'POST',
      headers: serviceHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(args),
    });
    if (!resp.ok) return null;  // 404 (fn absent) / 42501 (ownership) / other → fall back
    const out = await resp.json();
    // PostgREST returns the function's jsonb result (object), possibly wrapped.
    const r = Array.isArray(out) ? out[0] : out;
    if (!r || !r.session || !r.snapshot) return null;
    return r;
  } catch (_e) {
    return null;
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
  savePracticeSession, getPracticeSessions, computeReadiness,
  completePracticeAtomic,
};
