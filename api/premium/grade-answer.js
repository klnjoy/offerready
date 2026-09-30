/**
 * POST /api/premium/grade-answer  (Vercel serverless function)
 * ---------------------------------------------------------------------------
 * Grades the candidate's OWN answer to a Defend node and pushes back like a
 * real interviewer (score + what held up + what was missing + one follow-up).
 * This is the feature that makes Pro an AI interviewer, not a study guide.
 *
 * Access matrix (mirrors the other premium endpoints — spec §20/§28/§34):
 *   anonymous                        -> 401
 *   authenticated, no entitlement    -> 403 (upgrade required)
 *   authenticated, entitled          -> 200 + feedback
 *   no OPENAI_API_KEY                -> 503 { fallback:true } (client shows model answer only)
 *   generation / validation error    -> 502/422/500, fail closed (no fake feedback)
 *
 * Cost / safety posture (mirrors analyze-job.js):
 *   - OPENAI_API_KEY is server-side only. One LLM call per request. No storage.
 *   - Inputs are length-capped; the candidate answer is never logged.
 *   - Output is structurally validated before return.
 */

'use strict';

const { setCors, send } = require('../_lib/http');
const { getUser } = require('../_lib/supabaseAuth');
const { hasEntitlement } = require('../_lib/entitlements');
const { SYSTEM_PROMPT, buildUserMessage, validateGrade } = require('../_lib/gradeAnswer');

const DEFAULT_MODEL = 'gpt-4o-mini';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 30000;
const MAX_OUTPUT_TOKENS = 700;
const REQUIRED_ENTITLEMENT = 'system_design_pro';

function safeParseJson(str) {
  if (typeof str !== 'string') return null;
  try { return JSON.parse(str); } catch (_) {}
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
  if (!user) { send(res, 401, { error: 'Sign in to have your answer graded.' }); return; }

  // 2) Authorization — Pro (fail closed).
  const entitled = await hasEntitlement(user.id, REQUIRED_ENTITLEMENT);
  if (!entitled) {
    send(res, 403, {
      error: 'AI answer feedback is part of OfferReady Pro.',
      upgrade: true,
      required_entitlement: REQUIRED_ENTITLEMENT,
    });
    return;
  }

  // 3) No key -> client falls back to showing the model answer only.
  if (!process.env.OPENAI_API_KEY) {
    send(res, 503, { fallback: true, error: 'Answer feedback is not configured on this deployment.' });
    return;
  }

  // 4) Parse + cap input.
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
  if (!body || typeof body !== 'object') { send(res, 400, { error: 'Invalid request body.' }); return; }

  const answer = String(body.answer || '').slice(0, 2500);
  const prompt = String(body.prompt || '').slice(0, 1200);
  const model_answer = String(body.model || '').slice(0, 1600);
  const signals = Array.isArray(body.signals) ? body.signals.slice(0, 6) : [];
  if (!prompt) { send(res, 400, { error: 'Missing the question to grade against.' }); return; }

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
        temperature: 0.2,
        max_tokens: MAX_OUTPUT_TOKENS,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserMessage({ prompt, signals, model: model_answer, answer }) },
        ],
      }),
    });

    if (resp.status === 429) { send(res, 429, { error: 'The feedback service is busy. Try again in a moment.' }); return; }
    if (!resp.ok) {
      console.error(`OpenAI non-OK status (grade): ${resp.status}`);
      send(res, 502, { error: 'The feedback service returned an error. Please try again.' });
      return;
    }

    const data = await resp.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : '';
    const result = validateGrade(safeParseJson(content));
    if (!result.ok) {
      console.error('Grade failed validation:', result.reason);
      send(res, 422, { fallback: true, error: 'Could not grade this answer. Showing the strong answer instead.' });
      return;
    }

    send(res, 200, { ok: true, model, feedback: result.feedback });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      send(res, 504, { error: 'Grading timed out. Please try again.' });
      return;
    }
    console.error('grade-answer failure:', err && err.name);
    send(res, 500, { error: 'Something went wrong grading this answer. Please try again.' });
  } finally {
    clearTimeout(timer);
  }
};
