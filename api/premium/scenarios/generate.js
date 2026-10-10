/**
 * POST /api/premium/scenarios/generate  (Vercel serverless function)
 * ---------------------------------------------------------------------------
 * Generates a per-JOB "defend your decisions" scenario with the LLM, so the
 * same job description no longer yields the identical authored questions.
 *
 * Access matrix (plans.js `custom_scenarios` quota — Free 0, Pro 40/month):
 *   anonymous                       -> 401
 *   authenticated, over the quota   -> 403 { error, upgrade, feature, used, limit, plan }
 *   authenticated, within the quota -> 200 + generated scenario (use recorded after success)
 *   no OPENAI_API_KEY               -> 503 { fallback:true } (client uses authored)
 *   any generation/validation error -> 502/500, fail closed (no broken tree)
 *
 * Cost / safety posture (mirrors analyze-job.js):
 *   - OPENAI_API_KEY is server-side only. One LLM call per request. No storage.
 *   - JD text is length-capped and never logged.
 *   - Output is structurally validated (scenarioGen.validateTree) before it is
 *     returned; malformed trees are rejected rather than surfaced.
 *   - Plan + quota are enforced HERE, server-side, not in the client. Pro is
 *     any active entitlement from the Stripe Pro bundle (see plans.js).
 */

'use strict';

const { setCors, send } = require('../../_lib/http');
const { getUser } = require('../../_lib/supabaseAuth');
const { checkQuota, recordUse, quotaError } = require('../../_lib/plans');
const { getJob } = require('../../_lib/jobs');
const { getGapAnalysis } = require('../../_lib/readiness');
const {
  SYSTEM_PROMPT, buildUserMessage, validateTree,
} = require('../../_lib/scenarioGen');

const DEFAULT_MODEL = 'gpt-4o-mini';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 45000;
const MAX_OUTPUT_TOKENS = 2600;
const FEATURE = 'custom_scenarios';

// Categories the client filter understands (matches scenario.js CATEGORY_LABELS).
const VALID_CATEGORIES = [
  'ai-engineer', 'ai-architect', 'data-engineer', 'data-architect',
  'cloud-platform', 'ai-security', 'fde',
];

function safeParseJson(str) {
  if (typeof str !== 'string') return null;
  try { return JSON.parse(str); } catch (_) {}
  // Tolerate a stray code fence if the model added one.
  const m = /\{[\s\S]*\}/.exec(str);
  if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
  return null;
}

module.exports = async function handler(req, res) {
  setCors(res, req.headers && req.headers.origin);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed.' }); return; }

  // 1) Identity.
  const user = await getUser(req);
  if (!user) { send(res, 401, { error: 'Sign in to generate a scenario.' }); return; }

  // 2) Plan quota (Free: not included -> 403 upgrade; Pro: fair-use cap).
  const quota = await checkQuota(user.id, FEATURE);
  if (!quota.ok) { send(res, 403, quotaError(quota, FEATURE)); return; }

  // 3) No key -> tell client to fall back to the authored scenario.
  if (!process.env.OPENAI_API_KEY) {
    send(res, 503, { fallback: true, error: 'Scenario generation is not configured on this deployment.' });
    return;
  }

  // 4) Parse + cap input.
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
  if (!body || typeof body !== 'object') { send(res, 400, { error: 'Invalid request body.' }); return; }

  let jobDescription = String(body.jobDescription || '').slice(0, 6000);
  let targetRole = String(body.targetRole || '').slice(0, 200);
  let analysis = (body.analysis && typeof body.analysis === 'object') ? body.analysis : {};
  let gapFocus = [];
  // A saved job of this user is the source of truth: its own JD, analysis and
  // resume gaps (not whatever job the browser analyzed last).
  const jobId = typeof body.job_id === 'string' ? body.job_id.slice(0, 128) : '';
  if (jobId) {
    try {
      const job = await getJob(user.id, jobId);
      if (job) {
        if (job.job_description) jobDescription = String(job.job_description).slice(0, 6000);
        if (job.analysis && typeof job.analysis === 'object') analysis = job.analysis;
        if (job.title) targetRole = String(job.title).slice(0, 200);
        const gap = await getGapAnalysis(user.id, jobId);
        const r = gap && gap.result ? gap.result : {};
        gapFocus = [].concat(r.missingSkills || [], r.missingExperience || [], r.missingKeywords || [])
          .filter((x) => typeof x === 'string').slice(0, 10);
      }
    } catch (_e) { /* fall back to the request body */ }
  }
  let category = String(body.category || '').toLowerCase();
  if (VALID_CATEGORIES.indexOf(category) === -1) category = null;
  if (!jobDescription && !targetRole && !Object.keys(analysis).length) {
    send(res, 400, { error: 'Provide a job description or analysis to generate from.' });
    return;
  }

  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
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
        model,
        temperature: 0.4,
        max_tokens: MAX_OUTPUT_TOKENS,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserMessage({ jobDescription, targetRole, analysis, gapFocus }) },
        ],
      }),
    });

    if (resp.status === 429) { send(res, 429, { error: 'The generation service is busy. Try again in a moment.' }); return; }
    if (!resp.ok) {
      console.error(`OpenAI non-OK status (generate): ${resp.status}`);
      send(res, 502, { error: 'The generation service returned an error. Please try again.' });
      return;
    }

    const data = await resp.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : '';
    const parsed = safeParseJson(content);
    const result = validateTree(parsed);
    if (!result.ok) {
      console.error('Generated scenario failed validation:', result.reason);
      // Fail closed: tell the client to use the authored scenario instead.
      send(res, 422, { fallback: true, error: 'Could not generate a valid scenario. Using the standard one.' });
      return;
    }

    const title = (parsed && typeof parsed.title === 'string' && parsed.title.trim())
      ? parsed.title.trim()
      : ('Defend your decisions — ' + (targetRole || 'your role'));

    await recordUse(user.id, FEATURE);
    send(res, 200, {
      ok: true,
      generated: true,
      model,
      scenario: {
        slug: 'generated:' + (category || 'role'),
        title: title,
        category: category || 'ai-engineer',
        content: result.content,
      },
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      send(res, 504, { error: 'Generation timed out. Please try again.' });
      return;
    }
    console.error('scenario generate failure:', err && err.name);
    send(res, 500, { error: 'Something went wrong generating the scenario. Please try again.' });
  } finally {
    clearTimeout(timer);
  }
};
