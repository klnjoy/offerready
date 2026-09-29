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
