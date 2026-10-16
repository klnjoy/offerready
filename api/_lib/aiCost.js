/*
 * api/_lib/aiCost.js — record what every AI call costs, per feature.
 * ---------------------------------------------------------------------------
 * After each OpenAI call the endpoint calls track(feature, data, t0, userId).
 * One row goes to public.ai_calls (migration 0017): feature, model, tokens
 * (input, cached input, output), estimated cost in USD and duration. No
 * prompts, answers, resumes or job descriptions are stored: numbers only.
 *
 * FAIL-SAFE: if Supabase isn't configured or the table doesn't exist yet, the
 * write is skipped (logged once per instance). A logging problem never fails
 * or noticeably slows a user's request (short timeout, errors swallowed).
 *
 * Prices are USD per 1M tokens [input, cached input, output], from the model
 * pages on developers.openai.com (checked Oct 2026). The longest matching
 * prefix wins, so "gpt-4o-mini-2024-07-18" uses "gpt-4o-mini". Unknown models
 * fall back to gpt-4o-mini prices and are flagged with priced=false.
 */

'use strict';

const PRICES = {
  'gpt-4o-mini': [0.15, 0.075, 0.6],
  'gpt-4o': [2.5, 1.25, 10],
  'gpt-4.1-nano': [0.1, 0.025, 0.4],
  'gpt-4.1-mini': [0.4, 0.1, 1.6],
  'gpt-4.1': [2, 0.5, 8],
};
const FALLBACK = 'gpt-4o-mini';
const WRITE_TIMEOUT_MS = 1500;
const FEATURE_RE = /^[a-z][a-z0-9_]{1,39}$/;

function priceFor(model) {
  const m = String(model || '').toLowerCase();
  const key = Object.keys(PRICES).filter((k) => m.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  return { key: key || FALLBACK, priced: !!key, p: PRICES[key || FALLBACK] };
}

const int = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.round(Number(n)) : 0);

/** Token counts from an OpenAI chat-completions `usage` object. */
function tokens(usage) {
  const u = usage || {};
  const input = int(u.prompt_tokens);
  const cached = Math.min(input, int(u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens));
  return { input, cached, output: int(u.completion_tokens) };
}

/** Estimated cost in USD (6 decimals). */
function costUsd(model, usage) {
  const { p } = priceFor(model);
  const t = tokens(usage);
  const usd = ((t.input - t.cached) * p[0] + t.cached * p[1] + t.output * p[2]) / 1e6;
  return Math.round(usd * 1e6) / 1e6;
}

function restBase() {
  const url = process.env.SUPABASE_URL;
  return url ? url.replace(/\/+$/, '') + '/rest/v1' : null;
}
function configured() { return !!(restBase() && process.env.SUPABASE_SERVICE_ROLE_KEY); }
function svcHeaders(extra) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Object.assign({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, extra || {});
}

let warned = false;

/** Build the row (exported for tests). */
function row(feature, data, ms, userId, ok) {
  const model = String((data && data.model) || process.env.OPENAI_MODEL || FALLBACK).slice(0, 80);
  const t = tokens(data && data.usage);
  return {
    feature: FEATURE_RE.test(feature) ? feature : 'other',
    model,
    input_tokens: t.input,
    cached_tokens: t.cached,
    output_tokens: t.output,
    cost_usd: costUsd(model, data && data.usage),
    priced: priceFor(model).priced,
    ms: Math.max(0, Math.min(600000, Math.round(Number(ms) || 0))),
    ok: ok !== false,
    user_id: userId || null,
  };
}

/**
 * Record one AI call. `data` is the parsed OpenAI response (or { model, usage }
 * from a stream); `t0` is Date.now() taken just before the request.
 * Never throws; resolves when the write finished or timed out.
 */
async function track(feature, data, t0, userId, ok) {
  try {
    if (!configured()) return;
    const body = row(feature, data, Date.now() - (Number(t0) || Date.now()), userId, ok);
    if (!body.input_tokens && !body.output_tokens) return; // nothing billed
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WRITE_TIMEOUT_MS);
    try {
      const resp = await fetch(restBase() + '/ai_calls', {
        method: 'POST', signal: controller.signal,
        headers: svcHeaders({ Prefer: 'return=minimal' }),
        body: JSON.stringify(body),
      });
      if (!resp.ok && !warned) { warned = true; console.warn('[aiCost] write skipped, status ' + resp.status + ' (is migration 0017 applied?)'); }
    } finally { clearTimeout(timer); }
  } catch (err) {
    if (!warned) { warned = true; console.warn('[aiCost] write skipped:', err && err.name); }
  }
}

/** Per-feature totals since `days` ago (admin view). Throws on storage errors. */
async function summary(days) {
  if (!configured()) throw new Error('Supabase not configured');
  const d = Math.max(1, Math.min(365, Math.round(Number(days) || 30)));
  const since = new Date(Date.now() - d * 86400000).toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(restBase() + '/rpc/ai_cost_summary', {
      method: 'POST', signal: controller.signal, headers: svcHeaders(),
      body: JSON.stringify({ p_since: since }),
    });
    if (!resp.ok) throw new Error('ai_cost_summary ' + resp.status);
    const rows = await resp.json();
    return { days: d, since, rows: Array.isArray(rows) ? rows : [] };
  } finally { clearTimeout(timer); }
}

/** Emails allowed to see the cost view: ADMIN_EMAILS="a@x.com,b@y.com". */
function isAdmin(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return false;
  return String(process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).includes(e);
}

module.exports = { track, summary, isAdmin, costUsd, tokens, priceFor, _row: row, PRICES };
