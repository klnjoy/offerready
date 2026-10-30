/**
 * api/_lib/fitEvidence.js: per-requirement job-fit evidence, checked against
 * the resume on the server.
 *
 * The gap analysis model lists the job's requirements and, for each one,
 * quotes the resume line that supports it. A quote is only shown as resume
 * evidence when it is really in the resume (normalized substring, or nearly
 * all of its consecutive word pairs found in the resume). A "supported" or
 * "partial" row whose quote can't be found becomes "unverified": the model
 * claimed evidence we can't show the candidate, so we don't credit it.
 */

'use strict';

const IMPORTANCE = ['essential', 'preferred'];
const STATUS = ['supported', 'partial', 'missing'];
const MAX_ROWS = 14;

const norm = (s) => String(s || '').toLowerCase()
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[^a-z0-9%$+#.' ]+/g, ' ')
  .replace(/\.(?!\d)/g, ' ')
  .replace(/\s+/g, ' ').trim();

function bigrams(text) {
  const w = norm(text).split(' ').filter(Boolean);
  const out = [];
  for (let i = 0; i < w.length - 1; i++) out.push(w[i] + ' ' + w[i + 1]);
  return out;
}

/**
 * Is `quote` really in `resume`? Exact normalized substring, or at least 85%
 * of its consecutive word pairs appear in the resume (tolerates a dropped
 * word or changed punctuation, not an invented sentence). Needs 3+ words.
 */
function quoteInResume(quote, resume) {
  const q = norm(quote);
  if (!q || q.split(' ').length < 3) return false;
  const r = norm(resume);
  if (!r) return false;
  if (r.includes(q)) return true;
  const qb = bigrams(q);
  if (!qb.length) return false;
  const rb = new Set(bigrams(r));
  const hit = qb.filter((b) => rb.has(b)).length;
  return hit / qb.length >= 0.85;
}

const clip = (v, n) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, n) : '');

/**
 * Normalize the model's `requirements` list and verify every quote.
 * @param {unknown} list   parsed model output
 * @param {string} resume  the resume text the model was given ('' when only signals)
 * @returns {{requirement:string, importance:'essential'|'preferred', status:'supported'|'partial'|'missing'|'unverified', evidence:string, why:string, next:string}[]}
 */
function normalizeRequirements(list, resume) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const x of list) {
    if (!x || typeof x !== 'object') continue;
    const requirement = clip(x.requirement, 140).replace(/[.;]+$/, '');
    if (requirement.length < 2) continue;
    const key = requirement.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const importance = IMPORTANCE.includes(String(x.importance).toLowerCase()) ? String(x.importance).toLowerCase() : 'essential';
    let status = STATUS.includes(String(x.status).toLowerCase()) ? String(x.status).toLowerCase() : 'missing';
    let evidence = clip(x.evidence, 240).replace(/^["']+|["']+$/g, '');
    let why = clip(x.why, 280);
    if (status === 'missing') evidence = '';
    else if (!quoteInResume(evidence, resume)) {
      // Claimed support we can't show from the resume: don't credit it.
      // Its reason described evidence we can't show, so it goes too.
      status = 'unverified';
      evidence = '';
      why = '';
    }
    out.push({ requirement, importance, status, evidence, why: why.slice(0, 400), next: clip(x.next, 280) });
    if (out.length >= MAX_ROWS) break;
  }
  // Essentials first, keeping the model's order within each group.
  return out.filter((r) => r.importance === 'essential').concat(out.filter((r) => r.importance === 'preferred'));
}

const RANK = { supported: 2, partial: 1, missing: 0, unverified: 0 };

/** Same requirement? Equal after normalizing, or most of the word pairs shared. */
function sameRequirement(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const xb = bigrams(x);
  const yb = new Set(bigrams(y));
  if (!xb.length || !yb.size) return false;
  const hit = xb.filter((p) => yb.has(p)).length;
  return hit / Math.max(xb.length, yb.size) >= 0.6;
}

/**
 * A re-check of the same job keeps what is still true. The model judges each
 * row afresh and can word a quote slightly differently or rate a row lower on
 * an identical resume, which made a re-check drop after you only ADDED to the
 * resume. Here, for a previous row that was supported or partial:
 *  - if its resume quote is still in the resume (checked again, server side),
 *    the row can't come back lower than before: the previous status, quote and
 *    reason are kept;
 *  - if the quote is gone (you removed or rewrote that line), the new judgment
 *    stands, so the score can still go down when the resume really lost it.
 * A requirement the model left out this time comes back (judged the same way,
 * or "missing"), and rows that weren't on the list before are dropped, so the
 * list stays the same and the score moves only when the resume does.
 * Only applies when there were 3+ previous rows; otherwise returns `rows`.
 */
function keepStillTrue(rows, previous, resume) {
  const prev = Array.isArray(previous) ? previous.filter((p) => p && typeof p === 'object' && typeof p.requirement === 'string' && p.requirement.trim()) : [];
  if (prev.length < 3 || !Array.isArray(rows)) return rows;
  const used = new Set();
  const out = [];
  for (const p of prev.slice(0, MAX_ROWS)) {
    let idx = rows.findIndex((r, i) => !used.has(i) && norm(r.requirement) === norm(p.requirement));
    if (idx < 0) idx = rows.findIndex((r, i) => !used.has(i) && sameRequirement(r.requirement, p.requirement));
    const pStatus = STATUS.includes(p.status) ? p.status : 'missing';
    const pEvidence = typeof p.evidence === 'string' ? p.evidence : '';
    const stillShown = pStatus !== 'missing' && pEvidence && quoteInResume(pEvidence, resume);
    const kept = {
      requirement: clip(p.requirement, 140),
      importance: IMPORTANCE.includes(p.importance) ? p.importance : 'essential',
      status: stillShown ? pStatus : 'missing',
      evidence: stillShown ? clip(pEvidence, 240) : '',
      why: stillShown ? clip(p.why, 400) : '',
      next: clip(p.next, 280),
    };
    if (idx < 0) { out.push(kept); continue; }
    used.add(idx);
    const r = rows[idx];
    // Same wording and importance as last time; the better of the two
    // judgments when the old evidence is still really in the resume.
    const row = Object.assign({}, r, { requirement: kept.requirement, importance: kept.importance });
    if (stillShown && (RANK[r.status] || 0) < RANK[pStatus]) {
      row.status = kept.status; row.evidence = kept.evidence; row.why = kept.why;
    }
    out.push(row);
  }
  return out.filter((r) => r.importance === 'essential').concat(out.filter((r) => r.importance === 'preferred'));
}

module.exports = { normalizeRequirements, quoteInResume, keepStillTrue };
