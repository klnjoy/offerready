/**
 * GET /api/areas  (Vercel serverless function)
 * ---------------------------------------------------------------------------
 * Returns the list of knowledge-base topic areas the chat widget uses to
 * populate its "Filter by area" dropdown. The hosted /api/ask endpoint accepts
 * any `area` string (it's a soft filter/hint), so this is a curated, static
 * list of OfferReady's topics — no model call, no storage.
 *
 * Why this exists: chatbot.js fetches /api/areas on load. Without this endpoint
 * Vercel returns a 404 with no CORS headers, which surfaces in the browser
 * console as a (misleading) CORS error on every page. This endpoint returns the
 * list with the same exact-origin CORS as the other functions, clearing both.
 *
 * Same CORS posture as ask.js / analyze-job.js.
 */

'use strict';

// Curated topic areas (match the KB's coverage; keep short + readable).
const AREAS = [
  'llm-fundamentals',
  'prompt-engineering',
  'rag',
  'retrieval-tuning',
  'vector-db',
  'agents',
  'agent-engineering',
  'mcp',
  'langchain',
  'bedrock',
  'observability',
  'llmops',
  'reliability',
  'cost-optimization',
  'kubernetes',
  'devops-ai',
  'system-design',
  'security',
  'snowflake',
  'databricks',
  'dbt',
  'sql',
  'python',
  'aws',
  'data-engineering',
  'behavioral',
  'fde',
];

function setCors(res, origin) {
  const allowed = (process.env.ALLOWED_ORIGIN || 'https://klnjoy.github.io').replace(/\/+$/, '');
  const reqOrigin = (origin || '').replace(/\/+$/, '');
  const value = reqOrigin && reqOrigin === allowed ? origin : allowed;
  res.setHeader('Access-Control-Allow-Origin', value);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Cache at the edge for a day — the list is static.
  res.setHeader('Cache-Control', 'public, max-age=86400');
}

module.exports = function handler(req, res) {
  setCors(res, req.headers && req.headers.origin);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') {
    res.status(405).setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed.' }));
    return;
  }
  res.status(200).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ areas: ['all'].concat(AREAS) }));
};
