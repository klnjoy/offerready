/**
 * POST /api/ask  (Vercel serverless function)
 *
 * Powers the public "Ask the Knowledge Base" chat widget. This is a HOSTED,
 * lightweight assistant scoped to OfferReady's topics. Unlike the local
 * agent/serve.py (which does true retrieval with page citations from the built
 * index), this hosted version answers from the model with a tight system prompt
 * and does NOT fabricate citations — instead it suggests using on-site search /
 * relevant pages. This keeps the public chat working without shipping the whole
 * retrieval index to the serverless runtime.
 *
 * Security/cost: same posture as analyze-job — key server-side only, CORS
 * restricted, input capped, one LLM call, no storage, no content logging,
 * no-key -> 503 so the widget can show a graceful message.
 */

'use strict';

const { lookupResource } = require('./lib/skillMap');

const DEFAULT_MODEL = 'gpt-4o-mini';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 30000;
const MAX_OUTPUT_TOKENS = 700;
const Q_MAX = 800;

const SYSTEM_PROMPT = `
You are OfferReady's knowledge-base assistant. OfferReady is an interview-prep
and study site covering GenAI (LLMs, RAG, agents, MCP, vector DBs, prompt/context
engineering, observability, LLMOps, cost, reliability, Kubernetes), data & cloud
(Snowflake/Cortex, Databricks, dbt, SQL, AWS, Python, FastAPI), system design,
security, and interview preparation (FDE, AI Engineer, Staff/Principal).

Answer the user's question concisely and accurately, scoped to these topics.
Use short markdown (headings, bullets, bold, inline code) — no code fences.
Be honest about uncertainty. If the question is outside these topics, say so
briefly and steer back. Do NOT invent citations or URLs. Keep answers tight
(a few short paragraphs or a compact list).
`.trim();

function setCors(res, origin) {
  const allowed = process.env.ALLOWED_ORIGIN || 'https://klnjoy.github.io';
  if (origin && origin.startsWith(allowed)) res.setHeader('Access-Control-Allow-Origin', origin);
  else res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function send(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  setCors(res, req.headers && req.headers.origin);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed.' }); return; }
  if (!process.env.OPENAI_API_KEY) { send(res, 503, { error: 'Ask is not configured on this deployment.' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
  const question = body && typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) { send(res, 400, { error: 'Please enter a question.' }); return; }
  if (question.length > Q_MAX) { send(res, 413, { error: 'Question is too long.' }); return; }

  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(OPENAI_URL, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model, temperature: 0.3, max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: question },
        ],
      }),
    });
    if (resp.status === 429) { send(res, 429, { error: 'Busy right now — try again in a moment.' }); return; }
    if (!resp.ok) { console.error(`ask OpenAI status ${resp.status}`); send(res, 502, { error: 'The assistant had an error. Please try again.' }); return; }
    const data = await resp.json();
    const answer = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : '';
    if (!answer) { send(res, 502, { error: 'Empty answer. Please try again.' }); return; }

    // Best-effort: suggest one relevant on-site page based on the question.
    const hit = lookupResource(question);
    const citations = hit ? [{ label: hit.label, url: hit.path }] : [];

    send(res, 200, { answer, citations, area: (body && body.area) || 'all', used_llm: true });
  } catch (err) {
    if (err && err.name === 'AbortError') { send(res, 504, { error: 'The assistant timed out. Please try again.' }); return; }
    console.error('ask failure:', err && err.name);
    send(res, 500, { error: 'Something went wrong. Please try again.' });
  } finally {
    clearTimeout(timer);
  }
};
