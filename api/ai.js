/**
 * POST /api/ai  (Vercel serverless function) — Interview Readiness AI router.
 * ---------------------------------------------------------------------------
 * A single endpoint that fans out to several AI actions, so the platform can
 * grow features without adding a serverless function per feature (Vercel Hobby
 * caps at 12). Dispatch on body.action:
 *
 *   analyze_jd         -> structured JD analysis (free accounts; before sign-in, a free
 *                         preview: a few per network per day, migration 0026)
 *   gap_analysis       -> resume-vs-JD match score + gaps (auth required)
 *   generate_questions -> categorized interview questions from a JD (auth required)
 *   topic_questions    -> 5 fresh AI questions + answers on one bank topic (auth required)
 *   import_job_url     -> fetch a job posting from a link (sign-in optional, no LLM;
 *                         20/min per IP; see api/_lib/jobImport.js for the SSRF guards)
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
  ownsJob, saveGapAnalysis, saveQuestions, getGapAnalysis, getQuestions, getOtherJobPrompts,
  getPracticeSessions, computeReadiness, saveProgressSnapshot,
} = require('./_lib/readiness');
const { importJobUrl } = require('./_lib/jobImport');
const COPILOT = require('./_lib/copilot');
const TOPIC_Q = require('./_lib/topicQuestions');
const aiCost = require('./_lib/aiCost');

const DEFAULT_MODEL = 'gpt-4o-mini';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 45000;

/** One OpenAI JSON call. Returns { ok, content } or { ok:false, status, error }.
 * `feature` and `userId` label the cost row (api/_lib/aiCost.js). */
async function callOpenAI(system, user, maxTokens, temperature, feature, userId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const t0 = Date.now();
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
    await aiCost.track(feature || 'other', data, t0, userId);
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

/**
 * May this visitor (not signed in) have a free analysis now? Counts it if so.
 * The network is a one-way hash of the IP address with a server secret; the
 * address is never stored. Limits: ANON_PREVIEWS_PER_NETWORK (default 2) and
 * ANON_PREVIEWS_PER_DAY in total (default 300). False on any doubt.
 */
async function takeAnonPreview(req) {
  try {
    const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ip = rateLimit.clientIp(req);
    if (!url || !key || !ip || ip === 'unknown') return false;
    const salt = process.env.ANON_PREVIEW_SALT || key;
    const netKey = require('crypto').createHash('sha256').update(salt + ':' + ip).digest('hex');
    const perKey = Math.max(0, Math.round(Number(process.env.ANON_PREVIEWS_PER_NETWORK) || 2));
    const perDay = Math.max(0, Math.round(Number(process.env.ANON_PREVIEWS_PER_DAY) || 300));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const resp = await fetch(url + '/rest/v1/rpc/take_anon_preview', {
        method: 'POST', signal: controller.signal,
        headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_key: netKey, p_per_key: perKey, p_per_day: perDay }),
      });
      if (!resp.ok) return false;
      return (await resp.json()) === true;
    } finally { clearTimeout(timer); }
  } catch (_) {
    return false;
  }
}

async function handleAnalyzeJd(body, res, user, extra) {
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
  const out = await callOpenAI(JD_SYSTEM_PROMPT, buildJdUserMessage({ jobDescription, targetRole, resume }), analyzeMaxTokens, 0.2, 'analyze_job', user && user.id);
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
  send(res, 200, Object.assign({ ok: true, action: 'analyze_jd', analysis }, extra && extra.preview ? { preview: true } : {}));
}

async function handleGapAnalysis(body, res, user) {
  const jobDescription = String(body.jobDescription || '');
  if (jobDescription.trim().length < 30) { send(res, 400, { error: 'A job description is required for gap analysis.' }); return; }
  // A re-check of a saved job judges the same requirements as last time, so
  // the score moves only when the resume does (not because the list changed).
  const gapJobId = body.job_id || body.jobId;
  let previousRequirements = [];
  if (gapJobId && user && user.id) {
    try {
      const prevRow = await getGapAnalysis(user.id, gapJobId);
      const prev = prevRow && prevRow.result && prevRow.result.requirements;
      if (Array.isArray(prev)) previousRequirements = prev;
    } catch (_e) { previousRequirements = []; }
  }
  // No saved check on the server (e.g. the job isn't saved there): use the
  // rows the app last showed. Every quote is checked against this resume
  // again, so they can't credit anything the resume doesn't show.
  if (!previousRequirements.length && Array.isArray(body.previousRequirements)) {
    previousRequirements = body.previousRequirements.slice(0, 14);
  }
  const out = await callOpenAI(
    GAP_SYSTEM_PROMPT,
    buildGapUserMessage({
      jobTitle: body.jobTitle || body.targetRole,
      jobDescription,
      resumeText: body.resumeText || body.resume,
      resumeSignals: body.resumeSignals,
      previousRequirements,
    }),
    // The per-requirement evidence list roughly doubles the output.
    2600, 0.2, 'resume_match', user && user.id
  );
  if (!out.ok) { send(res, out.status, { error: out.error }); return; }
  // Quotes are checked against the resume that was sent (never stored).
  const result = validateGap(safeParseModelJson(out.content), String(body.resumeText || body.resume || '').slice(0, 12000), previousRequirements);
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

  // "more": keep the saved set (and its practice marks) and add NEW questions
  // that don't repeat it.
  const more = body.mode === 'more';
  const owned = !!(jobId && (await ownsJob(user.id, jobId)));
  let existing = [];
  if (more && owned) {
    try { existing = await getQuestions(user.id, jobId); } catch (_e) { existing = []; }
  }
  // Questions already written for the user's other jobs: this job's set must
  // not repeat them (two data jobs used to get near-identical sets).
  let otherJobs = [];
  try { otherJobs = await getOtherJobPrompts(user.id, jobId, 30); } catch (_e) { otherJobs = []; }
  const userMsg = buildQuestionsUserMessage({
    jobTitle: body.jobTitle || body.targetRole,
    seniority: body.seniority || analysis.seniority,
    jobDescription,
    technologies: analysis.technologies,
    coreSkills: analysis.coreSkills,
    missingSkills: gapResult && gapResult.missingSkills,
    missingKeywords: gapResult && gapResult.missingKeywords,
    missingExperience: gapResult && gapResult.missingExperience,
    avoid: existing.map((q) => q && q.prompt).filter(Boolean),
    otherJobs,
    company: body.company || analysis.company,
  });

  // One retry when the model returns an incomplete set (and there's time left
  // in the 60 s function budget).
  const started = Date.now();
  let result = null;
  let lastErr = null;
  for (let attempt = 0; attempt < 2 && !result; attempt++) {
    if (attempt && Date.now() - started > 15000) break;
    const out = await callOpenAI(QUESTIONS_SYSTEM_PROMPT, userMsg, 3200, attempt ? 0.4 : 0.6, 'job_questions', user && user.id);
    if (!out.ok) { lastErr = out; if (out.status === 504 || out.status === 429) break; continue; }
    const r = validateQuestions(safeParseModelJson(out.content));
    if (r.ok) result = r;
  }
  if (!result) {
    if (lastErr) { send(res, lastErr.status, { error: lastErr.error }); return; }
    send(res, 502, { error: 'Could not generate a full question set. Please try again.' });
    return;
  }

  let questions = result.questions;
  if (more && existing.length) {
    const key = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const seen = new Set(existing.map((q) => key(q.prompt)));
    const fresh = questions.filter((q) => !seen.has(key(q.prompt)));
    questions = existing.map((q) => ({ category: q.category, difficulty: q.difficulty, prompt: q.prompt, model_answer: q.model_answer, signals: q.signals }))
      .concat(fresh).slice(0, 60);
  }

  let saved = 0;
  if (owned) {
    saved = await saveQuestions(user.id, jobId, questions);
    // Generating a question set means prep is underway: reflect that on the
    // My Jobs card (best-effort sync; the authoritative data stays in questions/
    // practice_sessions/progress_metrics).
    if (saved) {
      try { await touchJobStats(user.id, jobId, { prepProgress: 50 }); } catch (_e) { /* best-effort */ }
    }
  }
  result = { ...result, questions };
  send(res, 200, { ok: true, action: 'generate_questions', questions: result.questions, counts: result.counts, job_id: jobId || null, saved: saved });
}

/** import_job_url — no LLM call, so it works without OPENAI_API_KEY. */
async function handleImportJobUrl(req, res, body) {
  if (!rateLimit.enforce(req, res, { scope: 'job_import', perIp: 20 })) return;
  const out = await importJobUrl(body.url);
  send(res, out.status, out.body);
}

module.exports = async function handler(req, res) {
  // /api/premium/tailor and /api/premium/appkit are rewritten here
  // (vercel.json) to stay within the serverless function limit; each is a
  // separate handler.
  const urlOp = typeof (req && req.url) === 'string' ? (/[?&]op=(tailor|appkit)(&|$)/.exec(req.url) || [])[1] || '' : '';
  const op = (req && req.query && req.query.op) || urlOp;
  if (op === 'tailor') return require('./_lib/handlers/tailor')(req, res);
  if (op === 'appkit') return require('./_lib/handlers/appKit')(req, res);
  setCors(res, req.headers && req.headers.origin);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed.' }); return; }
  // Burst/abuse guard (best-effort, per instance): 60/min per IP here, then
  // 20/min per user once identity is known.
  if (!rateLimit.enforce(req, res, { scope: 'ai' })) return;

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }

  // Link import does not use the AI provider, so it is dispatched before the
  // OPENAI_API_KEY check. Sign-in is optional.
  if (body && typeof body === 'object' && String(body.action || '').toLowerCase() === 'import_job_url') {
    await handleImportJobUrl(req, res, body);
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    send(res, 503, { demo: true, error: 'AI is not configured on this deployment.' });
    return;
  }

  if (!body || typeof body !== 'object') { send(res, 400, { error: 'Invalid request body.' }); return; }

  const action = String(body.action || '').toLowerCase();

  // analyze_jd requires a (free) account: every analysis counts toward the
  // monthly `analyses` quota. The app keeps the pasted JD across sign-in and
  // re-runs it; the sample walkthrough (/example) stays public and offline.
  // The others require identity so results can be attributed/persisted.
  if (action === 'analyze_jd') {
    const user = bearerToken(req) ? await getUser(req) : null;
    if (!user) {
      // A free preview before sign-in: a few per network per day and a daily
      // total (migration 0026). Anything unsure (no migration, no address,
      // storage down) falls back to asking for sign-in, so the cost stays bounded.
      if (!rateLimit.enforce(req, res, { scope: 'ai', perIp: 6 })) return;
      if (!(await takeAnonPreview(req))) {
        send(res, 401, { error: 'Sign in to analyze a job. It\'s free.', signin: true }); return;
      }
      await handleAnalyzeJd(body, res, null, { preview: true });
      return;
    }
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

  if (action === 'topic_questions') {
    const user = await getUser(req);
    if (!user) { send(res, 401, { error: 'Sign in to get AI questions. It\'s free.', signin: true }); return; }
    if (!rateLimit.enforce(req, res, { scope: 'ai', userId: user.id })) return;
    await handleTopicQuestions(body, res, user);
    return;
  }

  if (action === 'copilot') {
    const user = await getUser(req);
    if (!user) { send(res, 401, { error: 'Sign in to use the AI Interview Coach.' }); return; }
    if (!rateLimit.enforce(req, res, { scope: 'ai', userId: user.id })) return;
    await handleCopilot(body, res, user);
    return;
  }

  send(res, 400, { error: 'Unknown action.' });
};

/**
 * copilot — AI Interview Coach (api/_lib/copilot.js). Counts against
 * the existing ai_grading allowance (AI coaching); no new quota is invented.
 * The resume and stories are sent by the client for this call only and are
 * never stored or logged here.
 */
async function handleCopilot(body, res, user) {
  const question = String(body.question || '').trim();
  if (question.length < 8) { send(res, 400, { error: 'Type the interview question first.' }); return; }
  const q = await checkQuota(user.id, 'ai_grading');
  if (!q.ok) { send(res, 403, quotaError(q, 'ai_grading')); return; }
  const input = {
    mode: String(body.mode || 'answer'),
    question: question.slice(0, 800),
    jobTitle: String(body.jobTitle || '').slice(0, 200),
    requirements: Array.isArray(body.requirements) ? body.requirements.filter((x) => typeof x === 'string').slice(0, 15) : [],
    gaps: Array.isArray(body.gaps) ? body.gaps.filter((x) => typeof x === 'string').slice(0, 10) : [],
    resume: String(body.resume || '').slice(0, 8000),
    stories: Array.isArray(body.stories) ? body.stories.filter((x) => typeof x === 'string').map((x) => x.slice(0, 1200)).slice(0, 8) : [],
    draft: String(body.draft || '').slice(0, 2500),
    refine: COPILOT.REFINES[body.refine] ? body.refine : '',
    previous: String(body.previous || '').slice(0, 2500),
    thread: body.thread && typeof body.thread === 'object'
      ? { question: String(body.thread.question || '').slice(0, 400), answer: String(body.thread.answer || '').slice(0, 1200) }
      : null,
  };
  const out = await callOpenAI(COPILOT.SYSTEM_PROMPT, COPILOT.buildUserMessage(input), 1900, 0.4, 'coach', user && user.id);
  if (!out.ok) { send(res, out.status, { error: out.error }); return; }
  const v = COPILOT.validateCopilot(safeParseModelJson(out.content), input);
  if (!v.ok) { send(res, 502, { error: 'The AI Interview Coach could not build an answer this time. Please try again.' }); return; }
  await recordUse(user.id, 'ai_grading');
  send(res, 200, { ok: true, action: 'copilot', result: v.result });
}

/**
 * topic_questions — 5 fresh questions with model answers on one bank topic
 * (api/_lib/topicQuestions.js). Not metered, like generate_questions; the
 * cost is logged per call as feature "topic_questions" (admin AI costs).
 */
async function handleTopicQuestions(body, res, user) {
  const r = TOPIC_Q.readInput(body);
  if (!r.ok) { send(res, 400, { error: r.error }); return; }
  const out = await callOpenAI(TOPIC_Q.SYSTEM_PROMPT, TOPIC_Q.buildUserMessage(r.input), 1800, 0.7, 'topic_questions', user && user.id);
  if (!out.ok) { send(res, out.status, { error: out.error }); return; }
  const v = TOPIC_Q.validate(safeParseModelJson(out.content), r.input);
  if (!v.ok) { send(res, 502, { error: 'Couldn’t write questions this time. Please try again.' }); return; }
  send(res, 200, { ok: true, action: 'topic_questions', topic: r.input.topic, questions: v.questions });
}
