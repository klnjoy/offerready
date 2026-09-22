/**
 * POST /api/analyze-job  (Vercel serverless function, Node runtime)
 *
 * Analyzes a job description (and optional resume) with OpenAI and returns
 * structured JSON: role analysis, readiness, gaps, prep plan, and mapped
 * OfferReady resources.
 *
 * Security / cost posture:
 *  - OPENAI_API_KEY is server-side only (never sent to the browser).
 *  - Input validated + length-capped (see lib/validate.js).
 *  - CORS restricted to the OfferReady origin (ALLOWED_ORIGIN env, default the
 *    GitHub Pages site).
 *  - One LLM call per request. No storage. Full JD/resume never logged.
 *  - If no API key is configured, returns 503 with { demo: true } so the
 *    frontend can show a clearly-labeled sample instead of crashing.
 *  - Raw OpenAI errors are never forwarded to the client.
 */

'use strict';

const { SYSTEM_PROMPT, buildUserMessage } = require('./lib/prompt');
const { validateInput, safeParseModelJson, normalizeAnalysis } = require('./lib/validate');
const { mapSkillsToResources, lookupResource } = require('./lib/skillMap');

const DEFAULT_MODEL = 'gpt-4o-mini'; // cost-effective default; override via OPENAI_MODEL
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 45000;
const MAX_OUTPUT_TOKENS = 1800;

function setCors(res, origin) {
  const allowed = process.env.ALLOWED_ORIGIN || 'https://klnjoy.github.io';
  // Allow the configured origin (and let same-origin/local tools through by
  // echoing an exact match). We keep this strict to one origin.
  if (origin && (origin === allowed || origin.startsWith(allowed))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', allowed);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function send(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

/** Attach OfferReady resource links to the prep plan + build a resources list. */
function attachResources(analysis) {
  // Collect skill tags from the prep plan + core skills + technologies.
  const tags = new Set();
  (analysis.preparationPlan || []).forEach((p) => (p.skills || []).forEach((s) => tags.add(s)));
  (analysis.coreSkills || []).forEach((s) => tags.add(typeof s === 'string' ? s : s.name));
  (analysis.technologies || []).forEach((t) => tags.add(t));

  const resources = mapSkillsToResources(Array.from(tags).filter(Boolean));

  // Also annotate each prep-plan item with its best-matching resource (or null).
  const plan = (analysis.preparationPlan || []).map((p) => {
    let resource = null;
    for (const s of p.skills || []) {
      resource = lookupResource(s);
      if (resource) break;
    }
    return { ...p, resource: resource || null };
  });

  return { ...analysis, preparationPlan: plan, offerReadyResources: resources };
}

module.exports = async function handler(req, res) {
  const origin = req.headers && req.headers.origin;
  setCors(res, origin);

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed.' }); return; }

  // No key configured -> tell the frontend to show the labeled demo.
  if (!process.env.OPENAI_API_KEY) {
    send(res, 503, { demo: true, error: 'Analysis is not configured on this deployment.' });
    return;
  }

  // Parse body (Vercel parses JSON automatically, but be defensive).
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = null; }
  }

  const v = validateInput(body);
  if (!v.ok) { send(res, v.status, { error: v.error }); return; }
  const { jobDescription, targetRole, resume } = v.value;
  const resumeProvided = Boolean(resume);

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
          { role: 'user', content: buildUserMessage({ jobDescription, targetRole, resume }) },
        ],
      }),
    });

    if (resp.status === 429) { send(res, 429, { error: 'The analysis service is busy. Please try again in a moment.' }); return; }
    if (!resp.ok) {
      // Log only the status code — never the JD/resume or raw provider body.
      console.error(`OpenAI non-OK status: ${resp.status}`);
      send(res, 502, { error: 'The analysis service returned an error. Please try again.' });
      return;
    }

    const data = await resp.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : '';

    const parsed = safeParseModelJson(content);
    if (!parsed) {
      console.error('Model returned unparseable JSON.');
      send(res, 502, { error: 'The analysis could not be understood. Please try again.' });
      return;
    }

    const analysis = attachResources(normalizeAnalysis(parsed, resumeProvided));
    send(res, 200, { ok: true, model, analysis });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      send(res, 504, { error: 'The analysis timed out. Please try again with a shorter input.' });
      return;
    }
    console.error('analyze-job failure:', err && err.name); // name only, no payload
    send(res, 500, { error: 'Something went wrong analyzing this job. Please try again.' });
  } finally {
    clearTimeout(timer);
  }
};
