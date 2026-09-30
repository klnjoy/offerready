/**
 * POST /api/ai  (Vercel serverless function) — Interview Readiness AI router.
 * ---------------------------------------------------------------------------
 * A single endpoint that fans out to several AI actions, so the platform can
 * grow features without adding a serverless function per feature (Vercel Hobby
 * caps at 12). Dispatch on body.action:
 *
 *   analyze_jd         -> structured JD analysis (public, mirrors /api/analyze-job)
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
 */

'use strict';

const { setCors, send } = require('./_lib/http');
const { getUser } = require('./_lib/supabaseAuth');
const { SYSTEM_PROMPT: JD_SYSTEM_PROMPT, buildUserMessage: buildJdUserMessage } = require('./_lib/prompt');
const { validateInput, safeParseModelJson, normalizeAnalysis } = require('./_lib/validate');
const { mapSkillsToResources, lookupResource } = require('./_lib/skillMap');
const {
  GAP_SYSTEM_PROMPT, buildGapUserMessage, validateGap,
  QUESTIONS_SYSTEM_PROMPT, buildQuestionsUserMessage, validateQuestions,
} = require('./_lib/readinessAi');
const {
  ownsJob, saveGapAnalysis, saveQuestions,
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

async function handleAnalyzeJd(body, res) {
  const v = validateInput(body);
  if (!v.ok) { send(res, v.status, { error: v.error }); return; }
  const { jobDescription, targetRole, resume } = v.value;
  const out = await callOpenAI(JD_SYSTEM_PROMPT, buildJdUserMessage({ jobDescription, targetRole, resume }), 1800, 0.2);
  if (!out.ok) { send(res, out.status, { error: out.error }); return; }
  const parsed = safeParseModelJson(out.content);
  if (!parsed) { send(res, 502, { error: 'The analysis could not be understood. Please try again.' }); return; }
  const analysis = attachResources(normalizeAnalysis(parsed, Boolean(resume)));
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
  }
  send(res, 200, { ok: true, action: 'gap_analysis', result: result.result, job_id: jobId || null, saved: saved });
}

async function handleGenerateQuestions(body, res, user) {
  const jobDescription = String(body.jobDescription || '');
  if (jobDescription.trim().length < 30) { send(res, 400, { error: 'A job description is required to generate questions.' }); return; }
  const out = await callOpenAI(
    QUESTIONS_SYSTEM_PROMPT,
    buildQuestionsUserMessage({
      jobTitle: body.jobTitle || body.targetRole,
      seniority: body.seniority,
      jobDescription,
    }),
    2600, 0.5
  );
  if (!out.ok) { send(res, out.status, { error: out.error }); return; }
  const result = validateQuestions(safeParseModelJson(out.content));
  if (!result.ok) { send(res, 502, { error: 'Could not generate a full question set. Please try again.' }); return; }

  let saved = 0;
  const jobId = body.job_id || body.jobId;
  if (jobId && (await ownsJob(user.id, jobId))) {
    saved = await saveQuestions(user.id, jobId, result.questions);
  }
  send(res, 200, { ok: true, action: 'generate_questions', questions: result.questions, counts: result.counts, job_id: jobId || null, saved: saved });
}

module.exports = async function handler(req, res) {
  setCors(res, req.headers && req.headers.origin);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed.' }); return; }

  if (!process.env.OPENAI_API_KEY) {
    send(res, 503, { demo: true, error: 'AI is not configured on this deployment.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
  if (!body || typeof body !== 'object') { send(res, 400, { error: 'Invalid request body.' }); return; }

  const action = String(body.action || '').toLowerCase();

  // analyze_jd is public (value before signup). The others require identity so
  // results can be attributed/persisted to the user's jobs.
  if (action === 'analyze_jd') {
    await handleAnalyzeJd(body, res);
    return;
  }

  if (action === 'gap_analysis' || action === 'generate_questions') {
    const user = await getUser(req);
    if (!user) { send(res, 401, { error: 'Sign in to use this feature.' }); return; }
    if (action === 'gap_analysis') { await handleGapAnalysis(body, res, user); return; }
    await handleGenerateQuestions(body, res, user);
    return;
  }

  send(res, 400, { error: 'Unknown action.' });
};
