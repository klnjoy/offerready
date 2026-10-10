/**
 * validate.js — input validation + limits, and safe parsing of the model's
 * JSON so a malformed LLM response never crashes the function.
 */

'use strict';

const LIMITS = {
  JD_MIN: 30,
  JD_MAX: 12000,     // ~ a long job description; caps token cost
  ROLE_MAX: 200,
  RESUME_MAX: 16000, // caps token cost; resume is optional
};

/**
 * Validate the request body. Returns { ok, value } or { ok:false, error, status }.
 */
function validateInput(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'Invalid request body.' };
  }
  const jobDescription = typeof body.jobDescription === 'string' ? body.jobDescription.trim() : '';
  const targetRole = typeof body.targetRole === 'string' ? body.targetRole.trim() : '';
  const resume = typeof body.resume === 'string' ? body.resume.trim() : '';

  if (!jobDescription) {
    return { ok: false, status: 400, error: 'A job description is required.' };
  }
  if (jobDescription.length < LIMITS.JD_MIN) {
    return { ok: false, status: 400, error: 'The job description is too short to analyze.' };
  }
  if (jobDescription.length > LIMITS.JD_MAX) {
    return { ok: false, status: 413, error: `Job description exceeds the ${LIMITS.JD_MAX}-character limit.` };
  }
  if (targetRole.length > LIMITS.ROLE_MAX) {
    return { ok: false, status: 413, error: 'Target role is too long.' };
  }
  if (resume.length > LIMITS.RESUME_MAX) {
    return { ok: false, status: 413, error: `Resume exceeds the ${LIMITS.RESUME_MAX}-character limit.` };
  }
  return { ok: true, value: { jobDescription, targetRole, resume } };
}

/**
 * Safely extract a JSON object from a model response that *should* be JSON but
 * might be wrapped in prose or code fences. Returns the parsed object or null.
 */
function safeParseModelJson(text) {
  if (!text || typeof text !== 'string') return null;
  // Try direct parse first.
  try { return JSON.parse(text); } catch (_) { /* fall through */ }
  // Strip ```json fences if present.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch (_) { /* fall through */ }
  }
  // Grab the outermost {...} block.
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)); } catch (_) { /* fall through */ }
  }
  // Last resort: the response may be a TRUNCATED JSON object (model hit the
  // max_tokens cap mid-object). json_object mode guarantees valid JSON only if
  // it completes, so a cut-off response won't parse by any attempt above. Try
  // to repair it by trimming back to a safe boundary and balancing brackets.
  if (first !== -1) {
    const obj = repairTruncatedJson(text.slice(first));
    if (obj) return obj;
  }
  return null;
}

/**
 * Best-effort recovery of a JSON object string cut off mid-value (e.g. an LLM
 * response truncated at max_tokens). Strategy: progressively trim the tail back
 * to candidate cut points (after a closing bracket, a complete string, a comma,
 * or a literal/number), then at each candidate close any open string and append
 * the brackets needed to balance the structure, and try to parse. Returns the
 * parsed object on the first success, or null if nothing parses. Bounded by the
 * number of candidate cut points so it can't loop unbounded.
 */
function repairTruncatedJson(s) {
  if (!s || typeof s !== 'string') return null;

  // Collect candidate cut indices (exclusive end positions) that end on a
  // structurally safe token, scanning once and tracking string state.
  const cuts = [];
  let inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') { inStr = false; cuts.push(i + 1); }   // after a complete string
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '}' || c === ']') cuts.push(i + 1);                // after a closed container
    else if (c === ',') cuts.push(i);                            // before a dangling comma
    else if ((c >= '0' && c <= '9')) cuts.push(i + 1);           // after a digit (number)
    else if (c === 'e' && (s.slice(i - 3, i + 1) === 'true' || s.slice(i - 4, i + 1) === 'false')) cuts.push(i + 1);
    else if (c === 'l' && s.slice(i - 3, i + 1) === 'null') cuts.push(i + 1);
  }

  // Try the longest candidates first (most data preserved), then shorter ones.
  for (let k = cuts.length - 1; k >= 0; k--) {
    let out = s.slice(0, cuts[k]).replace(/,\s*$/, '');
    if (!out) continue;
    // Balance brackets based on the trimmed slice (string state re-scanned).
    const close = [];
    let inS = false, es = false, ok = true;
    for (let i = 0; i < out.length; i++) {
      const c = out[i];
      if (inS) { if (es) es = false; else if (c === '\\') es = true; else if (c === '"') inS = false; continue; }
      if (c === '"') { inS = true; continue; }
      if (c === '{') close.push('}');
      else if (c === '[') close.push(']');
      else if (c === '}' || c === ']') { if (!close.length) { ok = false; break; } close.pop(); }
    }
    if (!ok || inS) continue;   // unbalanced closer, or ended inside a string -> try a shorter cut
    for (let i = close.length - 1; i >= 0; i--) out += close[i];
    try { return JSON.parse(out); } catch (_) { /* try the next shorter candidate */ }
  }
  return null;
}

/**
 * Ensure the parsed analysis has the expected shape; fill missing fields with
 * safe defaults so the frontend can always render.
 */
function normalizeAnalysis(obj, resumeProvided) {
  const a = obj && typeof obj === 'object' ? obj : {};
  const arr = (v) => (Array.isArray(v) ? v : []);
  const str = (v) => (typeof v === 'string' ? v : '');
  return {
    jobTitle: str(a.jobTitle).trim().slice(0, 200),
    company: str(a.company).trim().slice(0, 200),
    roleSummary: str(a.roleSummary),
    seniority: str(a.seniority),
    coreSkills: arr(a.coreSkills),
    preferredSkills: arr(a.preferredSkills),
    technologies: arr(a.technologies),
    responsibilities: arr(a.responsibilities),
    experienceRequirements: arr(a.experienceRequirements),
    interviewSignals: arr(a.interviewSignals),
    resumeProvided: Boolean(resumeProvided),
    alignment: resumeProvided ? arr(a.alignment) : [],
    readiness: arr(a.readiness),
    potentialGaps: arr(a.potentialGaps),
    preparationPlan: arr(a.preparationPlan),
    nextStep: str(a.nextStep),
  };
}

module.exports = { LIMITS, validateInput, safeParseModelJson, normalizeAnalysis };
