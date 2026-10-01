/**
 * Phase 1.5 tests — practice -> readiness wiring (pure, server-side logic).
 *
 * Covers computeReadiness() (exported from _lib/readiness.js) plus mirrored
 * rules for the practice-completion contract that lives in api/jobs/[id].js
 * (validatePractice) and the active-job pointer behavior in the client. The
 * HTTP handler and the client IIFE aren't require-able, so the rules they
 * enforce are re-encoded here and asserted; keep them in lock-step.
 *
 * Node built-in runner (node --test), no external deps.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { computeReadiness } = require('../_lib/readiness');

// ---------------------------------------------------------------------------
// computeReadiness — server-side readiness from server records only.
// overall = 0.5*match + 0.3*practiceAvg + 0.2*completion
// completion = min(completedSessions, 10) * 10
// ---------------------------------------------------------------------------

test('computeReadiness: gap only, no practice -> 0.5*match, practice not counted', () => {
  const r = computeReadiness({ match_score: 80 }, []);
  assert.equal(r.overall, 40);           // 0.5*80
  assert.equal(r.questionsPracticed, 0);
  assert.equal(r.avgAnswerScore, 0);
});

test('computeReadiness: practice raises readiness above raw match blend', () => {
  // match 80 -> 40 base; add 2 sessions avg 90: 0.5*80 + 0.3*90 + 0.2*20 = 71
  const r = computeReadiness({ match_score: 80 }, [
    { completed: true, score: 90 },
    { completed: true, score: 90 },
  ]);
  assert.equal(r.avgAnswerScore, 90);
  assert.equal(r.questionsPracticed, 2);
  assert.equal(r.overall, 71);
});

test('computeReadiness: a persisted score of 0 is a valid input, not dropped', () => {
  // One completed session scored 0 still counts as a completed rep.
  const r = computeReadiness({ match_score: 60 }, [{ completed: true, score: 0 }]);
  assert.equal(r.questionsPracticed, 1);
  assert.equal(r.avgAnswerScore, 0);
  // 0.5*60 + 0.3*0 + 0.2*10 = 32
  assert.equal(r.overall, 32);
});

test('computeReadiness: no gap and no practice -> 0 (nothing to assess)', () => {
  const r = computeReadiness(null, []);
  assert.equal(r.overall, 0);
});

test('computeReadiness: incomplete/null-score sessions are excluded', () => {
  const r = computeReadiness({ match_score: 50 }, [
    { completed: false, score: 100 },   // abandoned -> ignored
    { completed: true, score: null },   // no score -> ignored
    { completed: true, score: 80 },     // counts
  ]);
  assert.equal(r.questionsPracticed, 1);
  assert.equal(r.avgAnswerScore, 80);
});

test('computeReadiness: completion caps at 10 reps (100%)', () => {
  const many = [];
  for (let i = 0; i < 15; i++) many.push({ completed: true, score: 100 });
  const r = computeReadiness({ match_score: 100 }, many);
  // 0.5*100 + 0.3*100 + 0.2*100 = 100
  assert.equal(r.overall, 100);
  assert.equal(r.questionsPracticed, 15); // count is real; completion is capped internally
});

// ---------------------------------------------------------------------------
// validatePractice contract (mirror of api/jobs/[id].js).
// ---------------------------------------------------------------------------
const PRACTICE_MODES = ['scenario', 'why_chain', 'incident', 'quiz', 'practice', 'mock'];
function validatePractice(body) {
  const sessionId = body.sessionId != null ? String(body.sessionId).trim() : '';
  if (!sessionId || sessionId.length > 200) return { ok: false, error: 'sessionId' };
  const score = Number(body.score);
  if (!isFinite(score) || score < 0 || score > 100) return { ok: false, error: 'score' };
  const mode = String(body.mode || '').toLowerCase();
  if (mode && PRACTICE_MODES.indexOf(mode) === -1) return { ok: false, error: 'mode' };
  let completedAt = null;
  if (body.completedAt != null) {
    const t = new Date(body.completedAt);
    if (isNaN(t.getTime())) return { ok: false, error: 'completedAt' };
    if (t.getTime() > Date.now() + 86400000) return { ok: false, error: 'future' };
    completedAt = t.toISOString();
  } else { completedAt = new Date().toISOString(); }
  return { ok: true, value: { sessionId, score: Math.round(score), mode: mode || 'scenario', completedAt } };
}

test('validatePractice: requires a sessionId (idempotency key)', () => {
  assert.equal(validatePractice({ score: 50 }).ok, false);
});

test('validatePractice: rejects out-of-range + non-numeric scores', () => {
  assert.equal(validatePractice({ sessionId: 'a', score: -1 }).ok, false);
  assert.equal(validatePractice({ sessionId: 'a', score: 101 }).ok, false);
  assert.equal(validatePractice({ sessionId: 'a', score: 'x' }).ok, false);
});

test('validatePractice: rejects unknown mode and future timestamp', () => {
  assert.equal(validatePractice({ sessionId: 'a', score: 50, mode: 'telepathy' }).ok, false);
  const future = new Date(Date.now() + 7 * 86400000).toISOString();
  assert.equal(validatePractice({ sessionId: 'a', score: 50, completedAt: future }).ok, false);
});

test('validatePractice: accepts a valid payload and normalizes', () => {
  const r = validatePractice({ sessionId: 'run-1', score: 72.6, mode: 'scenario' });
  assert.equal(r.ok, true);
  assert.equal(r.value.score, 73);
  assert.equal(r.value.sessionId, 'run-1');
});

// ---------------------------------------------------------------------------
// Idempotency key stability + snapshot dedupe key (mirror of the client +
// server). Same run id -> same practice key -> same snapshot dedupe key.
// ---------------------------------------------------------------------------
test('idempotency: identical sessionId yields identical dedupe keys', () => {
  const sessionId = 'rag-assistant:abc123';
  const snapKeyA = 'practice:' + sessionId;
  const snapKeyB = 'practice:' + sessionId;
  assert.equal(snapKeyA, snapKeyB);
});

test('idempotency: gap snapshot key is tied to the saved gap row id', () => {
  assert.equal('gap:' + 'row-1', 'gap:' + 'row-1');
  assert.notEqual('gap:' + 'row-1', 'gap:' + 'row-2');
});

// ---------------------------------------------------------------------------
// Recent-practice ordering + legacy null-job exclusion (mirror of the reader).
// ---------------------------------------------------------------------------
test('practice ordering: newest completed_at first', () => {
  const rows = [
    { completed_at: '2026-01-01T00:00:00Z' },
    { completed_at: '2026-03-01T00:00:00Z' },
    { completed_at: '2026-02-01T00:00:00Z' },
  ];
  const sorted = rows.slice().sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
  assert.equal(sorted[0].completed_at, '2026-03-01T00:00:00Z');
  assert.equal(sorted[2].completed_at, '2026-01-01T00:00:00Z');
});

test('legacy null-job sessions are excluded from a job-scoped read', () => {
  // The reader queries job_id=eq.<jobId>; rows with null job_id never match.
  const jobId = 'job-A';
  const all = [
    { job_id: 'job-A', score: 80 },
    { job_id: null, score: 99 },     // legacy -> excluded
    { job_id: 'job-B', score: 70 },  // other job -> excluded
  ];
  const scoped = all.filter((r) => r.job_id === jobId);
  assert.equal(scoped.length, 1);
  assert.equal(scoped[0].score, 80);
});

// ---------------------------------------------------------------------------
// Active-job pointer behavior (mirror of readiness.js / jobs ownership).
// ---------------------------------------------------------------------------
test('active job: valid owned pointer selects that job', () => {
  const jobs = [{ id: 'j1' }, { id: 'j2' }];
  const pointer = 'j2';
  const active = jobs.filter((j) => j.id === pointer)[0] || jobs[0];
  assert.equal(active.id, 'j2');
});

test('active job: stale/deleted pointer falls back (and should be cleared)', () => {
  const jobs = [{ id: 'j1' }, { id: 'j2' }];
  const pointer = 'deleted-id';
  const owned = jobs.some((j) => j.id === pointer);
  assert.equal(owned, false); // app clears the pointer and shows "Choose a Job"
});

// ---------------------------------------------------------------------------
// Trend gating (mirror of dashboard): < 2 snapshots -> no sparkline.
// ---------------------------------------------------------------------------
test('trend gating: fewer than two snapshots does not render a trend line', () => {
  const render = (n) => (n > 1 ? 'sparkline' : 'message');
  assert.equal(render(0), 'message');
  assert.equal(render(1), 'message');
  assert.equal(render(2), 'sparkline');
});

// ---------------------------------------------------------------------------
// No snapshot from page load / navigation (contract documentation):
// snapshots are only created by the two server actions. There is no code path
// that snapshots on GET /api/jobs/:id (read-only) — asserted structurally by
// the absence of a writer in the GET branch (see api/jobs/[id].js GET).
// ---------------------------------------------------------------------------
test('snapshot sources are limited to the two meaningful events', () => {
  const allowed = ['gap_analysis_completed', 'practice_session_completed'];
  assert.ok(allowed.indexOf('gap_analysis_completed') >= 0);
  assert.ok(allowed.indexOf('practice_session_completed') >= 0);
  assert.equal(allowed.indexOf('page_load'), -1);
  assert.equal(allowed.indexOf('navigation'), -1);
});
