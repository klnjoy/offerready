/**
 * Tests for the readiness "overall" selection rule (Batch 1 falsy-zero fix).
 *
 * The dashboard (content/assets/readiness.js) and the restored-job view
 * (content/assets/jobs.js) choose the overall readiness number like this:
 *
 *     hasPersistedOverall = latest && latest.overall_readiness != null
 *     overall = hasPersistedOverall ? latest.overall_readiness
 *                                   : weightedOverall(gap, practiceAvg, completion)
 *
 * Those files are browser IIFEs (not require-able), so this test re-encodes the
 * SAME pure rule and locks in the four required cases:
 *   - overall_readiness = 0            -> respected (NOT recomputed)
 *   - overall_readiness = positive     -> respected
 *   - overall_readiness = null         -> falls back to weightedOverall
 *   - latest snapshot absent (null)    -> falls back to weightedOverall
 *
 * If the client rule changes, update this mirror so the two stay in lock-step.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

// Mirror of weightedOverall() from content/assets/readiness.js.
function clampInt(n, lo, hi) {
  n = Math.round(Number(n));
  if (!isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
function weightedOverall(gap, practiceAvg, completion) {
  const match = gap ? (gap.match_score || 0) : 0;
  if (!gap && !practiceAvg) return 0;
  return clampInt(0.5 * match + 0.3 * (practiceAvg || 0) + 0.2 * (completion || 0), 0, 100);
}

// Mirror of the selection rule under test (post-fix: presence check, not truthiness).
function selectOverall(latest, gap, practiceAvg, completion) {
  const hasPersistedOverall = latest && latest.overall_readiness != null;
  return hasPersistedOverall
    ? latest.overall_readiness
    : weightedOverall(gap, practiceAvg, completion);
}

test('overall_readiness = 0 is respected (not replaced by the computed fallback)', () => {
  const latest = { overall_readiness: 0 };
  const gap = { match_score: 80 }; // would compute 40 if the bug were present
  assert.equal(selectOverall(latest, gap, 0, 0), 0);
});

test('overall_readiness = positive number is respected', () => {
  const latest = { overall_readiness: 72 };
  const gap = { match_score: 80 };
  assert.equal(selectOverall(latest, gap, 0, 0), 72);
});

test('overall_readiness = null falls back to weightedOverall', () => {
  const latest = { overall_readiness: null };
  const gap = { match_score: 80 };
  // 0.5*80 + 0.3*0 + 0.2*0 = 40
  assert.equal(selectOverall(latest, gap, 0, 0), 40);
});

test('overall_readiness = undefined falls back to weightedOverall', () => {
  const latest = {}; // property absent
  const gap = { match_score: 60 };
  assert.equal(selectOverall(latest, gap, 0, 0), 30);
});

test('no latest snapshot (null) falls back to weightedOverall', () => {
  const gap = { match_score: 90 };
  assert.equal(selectOverall(null, gap, 0, 0), 45);
});

test('fallback blends practice + completion when present', () => {
  // 0.5*60 + 0.3*80 + 0.2*50 = 30 + 24 + 10 = 64
  assert.equal(selectOverall(null, { match_score: 60 }, 80, 50), 64);
});
