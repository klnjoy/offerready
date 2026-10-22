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

module.exports = { normalizeRequirements, quoteInResume };
