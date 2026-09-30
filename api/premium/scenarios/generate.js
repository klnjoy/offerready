/**
 * POST /api/premium/scenarios/generate  (Vercel serverless function)
 * ---------------------------------------------------------------------------
 * Generates a per-JOB "defend your decisions" scenario with the LLM, so the
 * same job description no longer yields the identical authored questions.
 *
 * Access matrix (mirrors [slug].js — spec §20/§28/§34):
 *   anonymous                       -> 401
 *   authenticated, no entitlement   -> 403 (upgrade required)
 *   authenticated, entitled         -> 200 + generated scenario
 *   no OPENAI_API_KEY               -> 503 { fallback:true } (client uses authored)
 *   any generation/validation error -> 502/500, fail closed (no broken tree)
 *
 * Cost / safety posture (mirrors analyze-job.js):
 *   - OPENAI_API_KEY is server-side only. One LLM call per request. No storage.
 *   - JD text is length-capped and never logged.
 *   - Output is structurally validated (scenarioGen.validateTree) before it is
 *     returned; malformed trees are rejected rather than surfaced.
 *   - Gated behind the same 'system_design_pro' entitlement as authored Pro
 *     scenarios — entitlement is enforced HERE, server-side, not in the client.
 */

'use strict';

const { setCors, send } = require('../../_lib/http');
const { getUser } = require('../../_lib/supabaseAuth');
const { hasEntitlement } = require('../../_lib/entitlements');
const {
  SYSTEM_PROMPT, buildUserMessage, validateTree,
} = require('../../_lib/scenarioGen');

const DEFAULT_MODEL = 'gpt-4o-mini';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 45000;
const MAX_OUTPUT_TOKENS = 2600;
const REQUIRED_ENTITLEMENT = 'system_design_pro';

// Categories the client filter understands (matches scenario.js CATEGORY_LABELS).
const VALID_CATEGORIES = [
  'ai-engineer', 'ai-architect', 'data-architect',
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

  // 2) Authorization — Pro entitlement (fail closed).
  const entitled = await hasEntitlement(user.id, REQUIRED_ENTITLEMENT);
  if (!entitled) {
    send(res, 403, {
      error: 'Generating a custom scenario is part of OfferReady Pro.',
      upgrade: true,
      required_entitlement: REQUIRED_ENTITLEMENT,
    });
    return;
  }

  // 3) No key -> tell client to fall back to the authored scenario.
  if (!process.env.OPENAI_API_KEY) {
    send(res, 503, { fallback: true, error: 'Scenario generation is not configured on this deployment.' });
    return;
  }

  // 4) Parse + cap input.
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
  if (!body || typeof body !== 'object') { send(res, 400, { error: 'Invalid request body.' }); return; }

  const jobDescription = String(body.jobDescription || '').slice(0, 6000);
  const targetRole = String(body.targetRole || '').slice(0, 200);
  const analysis = (body.analysis && typeof body.analysis === 'object') ? body.analysis : {};
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
          { role: 'user', content: buildUserMessage({ jobDescription, targetRole, analysis }) },
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
