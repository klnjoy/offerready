/**
 * POST /api/ai  (Vercel serverless function) — Interview Readiness AI router.
 * ---------------------------------------------------------------------------
 * A single endpoint that fans out to several AI actions, so the platform can
 * grow features without adding a serverless function per feature (Vercel Hobby
 * caps at 12). Dispatch on body.action:
 *
 *   analyze_jd         -> structured JD analysis (auth required, free accounts included)
 *   gap_analysis       -> resume-vs-JD match score + gaps (auth required)
 *   generate_questions -> categorized interview questions from a JD (auth required)
 *
 * Security / cost posture (mirrors analyze-job.js):
 *   - OPENAI_API_KEY is server-side only. One LLM call per request. No storage.
 *   - Inputs length-capped; raw JD/resume never logged.
 *   - Model output structurally validated; malformed -> fail closed.
 *   - gap_analysis / generate_questions require a verified Supabase JWT. They do
 *     NOT require Pro (gap analysis + question generation are core funnel value,
 *     shown before the paywall per the product's "value before signup" stance);
 *     persistence + Pro-only depth live behind their own gates elsewhere.
 *   - Plans (api/_lib/plans.js): analyze_jd needs a signed-in user (401
 *     {error, signin:true} otherwise) and counts toward the monthly `analyses`
 *     quota (403 {upgrade:true,...} when over; recorded only after a
 *     successful analysis).
 *   - Rate limit (api/_lib/rateLimit.js): best-effort per instance, per IP and
 *     per user; 429 + Retry-After.
 */

'use strict';

const { setCors, send } = require('./_lib/http');
const { getUser, bearerToken } = require('./_lib/supabaseAuth');
const { checkQuota, recordUse, quotaError } = require('./_lib/plans');
const rateLimit = require('./_lib/rateLimit');
const { SYSTEM_PROMPT: JD_SYSTEM_PROMPT, buildUserMessage: buildJdUserMessage } = require('./_lib/prompt');
const { validateInput, safeParseModelJson, normalizeAnalysis } = require('./_lib/validate');
const { mapSkillsToResources, lookupResource } = require('./_lib/skillMap');
const {
  GAP_SYSTEM_PROMPT, buildGapUserMessage, validateGap,
  QUESTIONS_SYSTEM_PROMPT, buildQuestionsUserMessage, validateQuestions,
} = require('./_lib/readinessAi');
const { touchJobStats } = require('./_lib/jobs');
const {
  ownsJob, saveGapAnalysis, saveQuestions, getGapAnalysis,
  getPracticeSessions, computeReadiness, saveProgressSnapshot,
} = require('./_lib/readiness');

const DEFAULT_MODEL = 'gpt-4o-mini';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 45000;

/** One OpenAI JSON call. Returns { ok, content } or { ok:false, status, error }. */
async function callOpenAI(system, user, maxTokens, temperature) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(OPENAI_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        temperature: typeof temperature === 'number' ? temperature : 0.3,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (resp.status === 429) return { ok: false, status: 429, error: 'The AI service is busy. Try again in a moment.' };
    if (!resp.ok) {
      console.error(`OpenAI non-OK status (ai): ${resp.status}`);
      return { ok: false, status: 502, error: 'The AI service returned an error. Please try again.' };
    }
    const data = await resp.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : '';
    return { ok: true, content, model: (data && data.model) || (process.env.OPENAI_MODEL || DEFAULT_MODEL) };
  } catch (err) {
    if (err && err.name === 'AbortError') return { ok: false, status: 504, error: 'The AI request timed out. Please try again.' };
    console.error('ai router failure:', err && err.name);
    return { ok: false, status: 500, error: 'Something went wrong. Please try again.' };
  } finally {
    clearTimeout(timer);
  }
}

/** analyze_jd — same output shape as /api/analyze-job (with resource mapping). */
function attachResources(analysis) {
  const tags = new Set();
  (analysis.preparationPlan || []).forEach((p) => (p.skills || []).forEach((s) => tags.add(s)));
  (analysis.coreSkills || []).forEach((s) => tags.add(typeof s === 'string' ? s : s.name));
  (analysis.technologies || []).forEach((t) => tags.add(t));
  const resources = mapSkillsToResources(Array.from(tags).filter(Boolean));
  const plan = (analysis.preparationPlan || []).map((p) => {
    let resource = null;
    for (const s of p.skills || []) { resource = lookupResource(s); if (resource) break; }
    return Object.assign({}, p, { resource: resource || null });
  });
  return Object.assign({}, analysis, { preparationPlan: plan, offerReadyResources: resources });
}

async function handleAnalyzeJd(body, res, user) {
  const v = validateInput(body);
  if (!v.ok) { send(res, v.status, { error: v.error }); return; }
  // Monthly quota (the handler only reaches here with a user). Fails open on
  // storage errors.
  if (user) {
    const q = await checkQuota(user.id, 'analyses');
    if (!q.ok) { send(res, 403, quotaError(q, 'analyses')); return; }
  }
  const { jobDescription, targetRole, resume } = v.value;
  // Token budget: the analysis JSON is large (roleSummary + several arrays +
  // preparationPlan). With a resume it ALSO returns the per-requirement
  // `alignment` rows, so the output is materially bigger. 1800 tokens could
  // truncate the JSON mid-object -> response_format json_object stays valid
  // ONLY if it completes, so a cut-off response fails to parse and surfaces as
  // "The analysis could not be understood". Give it ample headroom (more when a
  // resume is present). gpt-4o-mini supports up to 16k output tokens.
  const analyzeMaxTokens = resume ? 4000 : 2600;
  const out = await callOpenAI(JD_SYSTEM_PROMPT, buildJdUserMessage({ jobDescription, targetRole, resume }), analyzeMaxTokens, 0.2);
  if (!out.ok) { send(res, out.status, { error: out.error }); return; }
  const parsed = safeParseModelJson(out.content);
  if (!parsed) {
    // Valid-JSON mode is on, so a parse failure almost always means truncation
    // (hit max_tokens) or an empty body. Log length to disambiguate in prod.
    console.error('[analyze_jd] unparseable model content', JSON.stringify({
      len: (out.content || '').length, hadResume: Boolean(resume),
    }));
    send(res, 502, { error: 'The analysis could not be understood. Please try again.' }); return;
  }
  const analysis = attachResources(normalizeAnalysis(parsed, Boolean(resume)));
  if (user) await recordUse(user.id, 'analyses'); // only after a successful analysis
  send(res, 200, { ok: true, action: 'analyze_jd', analysis });
}

async function handleGapAnalysis(body, res, user) {
  const jobDescription = String(body.jobDescription || '');
  if (jobDescription.trim().length < 30) { send(res, 400, { error: 'A job description is required for gap analysis.' }); return; }
  const out = await callOpenAI(
    GAP_SYSTEM_PROMPT,
    buildGapUserMessage({
      jobTitle: body.jobTitle || body.targetRole,
      jobDescription,
      resumeText: body.resumeText || body.resume,
      resumeSignals: body.resumeSignals,
    }),
    1200, 0.2
  );
  if (!out.ok) { send(res, out.status, { error: out.error }); return; }
  const result = validateGap(safeParseModelJson(out.content));
  if (!result.ok) { send(res, 502, { error: 'Could not produce a gap analysis. Please try again.' }); return; }

  // Persist to the job when a job_id is supplied and owned by this user.
  // Persistence is the source of truth; the client no longer keeps its own copy.
  let saved = false;
  const jobId = body.job_id || body.jobId;
  if (jobId && (await ownsJob(user.id, jobId))) {
    const row = await saveGapAnalysis(user.id, jobId, result.result, out.model || null);
    saved = !!row;
    // Snapshot the readiness ONLY after the gap row is persisted. Compute from
    // the saved gap + the job's existing practice (server records, never client
    // scores). Idempotent per saved gap row so a retry can't double-append.
    if (saved && row) {
      try {
        const practice = await getPracticeSessions(user.id, jobId, 50);
        const snap = computeReadiness(row, practice);
        snap.source = 'gap_analysis_completed';
        snap.dedupeKey = 'gap:' + row.id;
        await saveProgressSnapshot(user.id, jobId, snap);
      } catch (_e) { /* snapshot is best-effort; gap save already succeeded */ }
      // Keep the My Jobs list card truthful: reflect the persisted gap count
      // (missing skills + keywords) and mark prep as started. Best-effort sync
      // of already-persisted facts — not a new metric or formula.
      try {
        const gr = result.result || {};
        const gapsCount = ((gr.missingSkills || []).length)
          + ((gr.missingKeywords || []).length)
          + ((gr.missingExperience || []).length);
        await touchJobStats(user.id, jobId, { gapsCount: gapsCount, prepProgress: 25 });
      } catch (_e) { /* card-sync is best-effort */ }
    }
  }
  send(res, 200, { ok: true, action: 'gap_analysis', result: result.result, job_id: jobId || null, saved: saved });
}

async function handleGenerateQuestions(body, res, user) {
  const jobDescription = String(body.jobDescription || '');
  if (jobDescription.trim().length < 30) { send(res, 400, { error: 'A job description is required to generate questions.' }); return; }

  // Enrich the prompt with the ANALYZED JOB CONTEXT so questions are grounded
  // in THIS role's stack + gaps (not generic/reused). Technologies + core
  // skills come from the client-supplied analysis; the gap focus (missing
  // skills/keywords/experience) is read from the PERSISTED gap_analysis for an
  // owned job (authoritative), falling back to any client-supplied gap.
  const jobId = body.job_id || body.jobId;
  const analysis = (body.analysis && typeof body.analysis === 'object') ? body.analysis : {};
  let gapResult = (body.gap && typeof body.gap === 'object') ? body.gap : null;
  if (jobId && (await ownsJob(user.id, jobId))) {
    try {
      const gapRow = await getGapAnalysis(user.id, jobId);
      if (gapRow && gapRow.result) gapResult = gapRow.result;
    } catch (_e) { /* best-effort enrichment */ }
  }

  const out = await callOpenAI(
    QUESTIONS_SYSTEM_PROMPT,
    buildQuestionsUserMessage({
      jobTitle: body.jobTitle || body.targetRole,
      seniority: body.seniority || analysis.seniority,
      jobDescription,
      technologies: analysis.technologies,
      coreSkills: analysis.coreSkills,
      missingSkills: gapResult && gapResult.missingSkills,
      missingKeywords: gapResult && gapResult.missingKeywords,
      missingExperience: gapResult && gapResult.missingExperience,
    }),
    2600, 0.5
  );
  if (!out.ok) { send(res, out.status, { error: out.error }); return; }
  const result = validateQuestions(safeParseModelJson(out.content));
  if (!result.ok) { send(res, 502, { error: 'Could not generate a full question set. Please try again.' }); return; }

  // jobId already resolved + ownership used above for gap enrichment; reuse it.
  let saved = 0;
  if (jobId && (await ownsJob(user.id, jobId))) {
    saved = await saveQuestions(user.id, jobId, result.questions);
    // Generating a question set means prep is underway: reflect that on the
    // My Jobs card (best-effort sync; the authoritative data stays in questions/
    // practice_sessions/progress_metrics).
    if (saved) {
      try { await touchJobStats(user.id, jobId, { prepProgress: 50 }); } catch (_e) { /* best-effort */ }
    }
  }
  send(res, 200, { ok: true, action: 'generate_questions', questions: result.questions, counts: result.counts, job_id: jobId || null, saved: saved });
}

module.exports = async function handler(req, res) {
  setCors(res, req.headers && req.headers.origin);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed.' }); return; }
  // Burst/abuse guard (best-effort, per instance): 60/min per IP here, then
  // 20/min per user once identity is known.
  if (!rateLimit.enforce(req, res, { scope: 'ai' })) return;

  if (!process.env.OPENAI_API_KEY) {
    send(res, 503, { demo: true, error: 'AI is not configured on this deployment.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
  if (!body || typeof body !== 'object') { send(res, 400, { error: 'Invalid request body.' }); return; }

  const action = String(body.action || '').toLowerCase();

  // analyze_jd requires a (free) account: every analysis counts toward the
  // monthly `analyses` quota. The app keeps the pasted JD across sign-in and
  // re-runs it; the sample walkthrough (/example) stays public and offline.
  // The others require identity so results can be attributed/persisted.
  if (action === 'analyze_jd') {
    const user = bearerToken(req) ? await getUser(req) : null;
    if (!user) { send(res, 401, { error: 'Sign in to analyze a job. It\'s free.', signin: true }); return; }
    if (!rateLimit.enforce(req, res, { scope: 'ai', userId: user.id })) return;
    await handleAnalyzeJd(body, res, user);
    return;
  }

  if (action === 'gap_analysis' || action === 'generate_questions') {
    const user = await getUser(req);
    if (!user) { send(res, 401, { error: 'Sign in to use this feature.' }); return; }
    if (!rateLimit.enforce(req, res, { scope: 'ai', userId: user.id })) return;
    if (action === 'gap_analysis') { await handleGapAnalysis(body, res, user); return; }
    await handleGenerateQuestions(body, res, user);
    return;
  }

  send(res, 400, { error: 'Unknown action.' });
};
