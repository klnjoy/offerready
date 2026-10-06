/**
 * /api/jobs/:id  (Vercel serverless function)
 * ---------------------------------------------------------------------------
 * GET    → return one full saved job (including the analysis) for the owner.
 * DELETE → delete one saved job owned by the signed-in user.
 *
 * Identity from a verified Supabase JWT; all access scoped to that user id.
 * A job that isn't found OR isn't owned by the caller returns 404 (no leak of
 * whether the id exists for someone else).
 */

'use strict';

const { setCors, send } = require('../_lib/http');
const { getUser } = require('../_lib/supabaseAuth');
const { getJob, deleteJob, touchJobStats, repairedTitleFor, updateJobFields } = require('../_lib/jobs');
const {
  getGapAnalysis, getQuestions, getProgress,
  getPracticeSessions, savePracticeSession, computeReadiness, saveProgressSnapshot,
  completePracticeAtomic,
} = require('../_lib/readiness');

// Allowed enum-ish values for a practice completion (reject anything else).
const PRACTICE_MODES = ['scenario', 'why_chain', 'incident', 'quiz', 'practice', 'mock'];
const CATEGORY_MAX = 60;
const SLUG_MAX = 200;
const SESSION_ID_MAX = 200;

/**
 * Validate a client practice-completion payload. Returns { ok, value } or
 * { ok:false, error }. Never trusts user_id, job ownership, or readiness —
 * those are set/recomputed server-side.
 */
function validatePractice(body) {
  const sessionId = body.sessionId != null ? String(body.sessionId).trim() : '';
  if (!sessionId || sessionId.length > SESSION_ID_MAX) {
    return { ok: false, error: 'A valid sessionId is required for idempotency.' };
  }
  const score = Number(body.score);
  if (!isFinite(score) || score < 0 || score > 100) {
    return { ok: false, error: 'score must be a number between 0 and 100.' };
  }
  const mode = String(body.mode || '').toLowerCase();
  if (mode && PRACTICE_MODES.indexOf(mode) === -1) {
    return { ok: false, error: 'Unsupported practice mode.' };
  }
  const category = body.category != null ? String(body.category).slice(0, CATEGORY_MAX) : null;
  const contentSlug = body.contentSlug != null ? String(body.contentSlug).slice(0, SLUG_MAX) : null;
  // completedAt: accept a valid ISO timestamp, else stamp server-side.
  let completedAt = null;
  if (body.completedAt != null) {
    const t = new Date(body.completedAt);
    if (isNaN(t.getTime())) return { ok: false, error: 'completedAt must be a valid timestamp.' };
    // Reject absurd future timestamps (> 1 day ahead) to avoid trend poisoning.
    if (t.getTime() > Date.now() + 86400000) return { ok: false, error: 'completedAt is in the future.' };
    completedAt = t.toISOString();
  } else {
    completedAt = new Date().toISOString();
  }
  return {
    ok: true,
    value: {
      sessionId: sessionId.slice(0, SESSION_ID_MAX),
      score: Math.round(score),
      mode: mode || 'scenario',
      category,
      contentSlug,
      completedAt,
      completed: true,
    },
  };
}

module.exports = async function handler(req, res) {
  setCors(res, req.headers && req.headers.origin);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const id = (req.query && (req.query.id || req.query['[id]']))
    || (req.url || '').split('/').pop().split('?')[0];
  if (!id) { send(res, 400, { error: 'Missing job id.' }); return; }

  const user = await getUser(req);
  if (!user) { send(res, 401, { error: 'Sign in to open this job.' }); return; }

  if (req.method === 'GET') {
    const job = await getJob(user.id, id);
    if (!job) { send(res, 404, { error: 'Job not found.' }); return; }
    // Restore the FULL job state from the database — analysis (on the job row),
    // plus the persisted gap analysis, generated questions, readiness/progress
    // snapshots, and recent (job-scoped) practice. This is what makes a job
    // resumable on any device. Practice is read SERVER-SIDE scoped to this job
    // (legacy null-job rows are naturally excluded).
    const [gap, questions, progress, practice] = await Promise.all([
      getGapAnalysis(user.id, id),
      getQuestions(user.id, id),
      getProgress(user.id, id, 30),
      getPracticeSessions(user.id, id, 10),
    ]);
    // Legacy-title repair ON REOPEN ONLY: if this job's stored title is weak
    // (empty / "Not specified" / a bare seniority / a company-description
    // sentence) AND a reliable role can be derived from its OWN persisted
    // analysis, persist the corrected title and return it. Never a blanket
    // backfill, never overwrites a good or user-edited title, and never
    // replaces one weak guess with another (repairedTitleFor guards all that).
    try {
      const repaired = repairedTitleFor(job);
      if (repaired) {
        const updated = await updateJobFields(user.id, id, {
          title: repaired, updated_at: new Date().toISOString(),
        });
        if (updated && updated.title) job.title = updated.title;
      }
    } catch (_e) { /* repair is best-effort; original job still returned */ }
    send(res, 200, { ok: true, job, gap, questions, progress, practice });
    return;
  }

  if (req.method === 'POST') {
    // Authoritative practice-completion path (Phase 1.5). Records the session
    // AND the readiness snapshot server-side, as one logical operation.
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
    if (!body || typeof body !== 'object') { send(res, 400, { error: 'Invalid request body.' }); return; }
    if (String(body.action || '') !== 'complete_practice') {
      send(res, 400, { error: 'Unknown action.' }); return;
    }

    // Verify the route job belongs to the authenticated user BEFORE any write.
    const job = await getJob(user.id, id);
    if (!job) { send(res, 404, { error: 'Job not found.' }); return; }

    const v = validatePractice(body);
    if (!v.ok) { send(res, 400, { error: v.error }); return; }

    // Preferred path: ONE atomic transaction (session + snapshot) via the
    // complete_practice RPC (migration 0006). Both writes commit or neither
    // does — no "saved but readiness missing" partial state.
    const atomic = await completePracticeAtomic(user.id, id, v.value);
    if (atomic && atomic.session && atomic.snapshot) {
      // Reflect "practice completed" on the My Jobs card (best-effort sync).
      try { await touchJobStats(user.id, id, { prepProgress: 75 }); } catch (_e) { /* best-effort */ }
      send(res, 200, {
        ok: true,
        session: atomic.session,
        snapshot: atomic.snapshot,
        readiness: atomic.readiness || null,
        atomic: true,
      });
      return;
    }

    // Fallback (RPC not yet applied, or RPC errored): two-step write. Session
    // first; only snapshot if the session persisted. Explicit partial-failure.
    // 1) Persist the practice session (idempotent on user+job+session_id).
    const session = await savePracticeSession(user.id, id, v.value);
    if (!session) {
      // Authoritative write failed — do NOT report success or snapshot, and do
      // NOT fall back to an unscoped write. Client should retry.
      send(res, 502, {
        error: 'Could not save your practice session. Please try again.',
        persisted: false,
      });
      return;
    }

    // 2) Recompute readiness from SERVER records (gap + all job practice),
    //    then snapshot it. Idempotent per session so retries don't double-count.
    let snapshot = null;
    let readiness = null;
    try {
      const [gap, practice] = await Promise.all([
        getGapAnalysis(user.id, id),
        getPracticeSessions(user.id, id, 50),
      ]);
      readiness = computeReadiness(gap, practice);
      snapshot = await saveProgressSnapshot(user.id, id, Object.assign({}, readiness, {
        source: 'practice_session_completed',
        dedupeKey: 'practice:' + v.value.sessionId,
      }));
    } catch (_e) { /* handled by the partial-failure flag below */ }

    if (!snapshot) {
      // Session saved but snapshot did not. Report partial persistence
      // explicitly rather than a generic success.
      send(res, 207, {
        ok: false,
        partial: true,
        session,
        snapshot: null,
        readiness,
        error: 'Practice saved, but readiness could not be updated. It will reconcile on next activity.',
      });
      return;
    }

    try { await touchJobStats(user.id, id, { prepProgress: 75 }); } catch (_e) { /* best-effort */ }
    send(res, 200, { ok: true, session, snapshot, readiness });
    return;
  }

  if (req.method === 'DELETE') {
    // Confirm ownership first so a non-owner gets 404, not a silent success.
    const job = await getJob(user.id, id);
    if (!job) { send(res, 404, { error: 'Job not found.' }); return; }
    const ok = await deleteJob(user.id, id);
    if (!ok) { send(res, 502, { error: 'Could not delete this job. Please try again.' }); return; }
    send(res, 200, { ok: true, deleted: id });
    return;
  }

  send(res, 405, { error: 'Method not allowed.' });
};
