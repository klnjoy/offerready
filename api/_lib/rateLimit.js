/**
 * api/_lib/rateLimit.js — small in-memory token-bucket rate limiter.
 * ---------------------------------------------------------------------------
 * Abuse + cost protection for the AI endpoints (api/ai.js, api/ask.js, and any
 * endpoint that wants it, e.g. grade-answer, scenarios/generate, mock-turn).
 *
 * BEST-EFFORT, PER FUNCTION INSTANCE. Buckets live in this module's memory, so
 * each warm serverless instance enforces its own budget and a cold start resets
 * it. A determined client spread across instances can exceed the nominal rate.
 * That is acceptable here: the hard money limits are the monthly quotas in
 * plans.js (stored in Supabase); this limiter only blunts bursts and scripted
 * hammering cheaply, with zero network calls.
 *
 * UPGRADE PATH AT SCALE: swap the Map for a shared store with atomic counters
 * (Upstash Redis via @upstash/ratelimit, or Vercel KV) keeping the same
 * `enforce()` signature, so call sites do not change.
 *
 * Defaults: 20 requests/minute per signed-in user, 60/minute per IP for
 * anonymous callers. Over the limit -> 429 with a Retry-After header (seconds).
 */

'use strict';

const { send } = require('./http');

const DEFAULT_PER_USER = 20;   // tokens per minute per user id
const DEFAULT_PER_IP = 60;     // tokens per minute per IP (anonymous)
const WINDOW_MS = 60 * 1000;
const MAX_KEYS = 10000;        // bound memory on a long-lived instance

const buckets = new Map();     // key -> { tokens, last, cap }

/**
 * Take one token from bucket `key` (capacity `cap`, refilled linearly to `cap`
 * per minute). Returns { ok, remaining, retryAfter } where retryAfter is the
 * whole seconds until one token is available again (0 when ok).
 */
function take(key, cap, now) {
  const t = typeof now === 'number' ? now : Date.now();
  const rate = cap / WINDOW_MS;           // tokens per ms
  let b = buckets.get(key);
  if (!b || b.cap !== cap) {
    if (!b && buckets.size >= MAX_KEYS) prune(t);
    b = { tokens: cap, last: t, cap };
  } else {
    b.tokens = Math.min(cap, b.tokens + (t - b.last) * rate);
    b.last = t;
  }
  // Re-insert so Map order approximates least-recently-used for pruning.
  buckets.delete(key);
  buckets.set(key, b);
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { ok: true, remaining: Math.floor(b.tokens), retryAfter: 0 };
  }
  const retryAfter = Math.max(1, Math.ceil((1 - b.tokens) / rate / 1000));
  return { ok: false, remaining: 0, retryAfter };
}

/** Drop full (idle) buckets first, then the oldest, to stay under MAX_KEYS. */
function prune(now) {
  for (const [k, b] of buckets) {
    const refilled = Math.min(b.cap, b.tokens + (now - b.last) * (b.cap / WINDOW_MS));
    if (refilled >= b.cap) buckets.delete(k);
  }
  while (buckets.size >= MAX_KEYS) {
    const oldest = buckets.keys().next().value;
    buckets.delete(oldest);
  }
}

/** Best-effort client IP (Vercel sets x-forwarded-for / x-real-ip). */
function clientIp(req) {
  const h = (req && req.headers) || {};
  const xff = h['x-forwarded-for'] || h['X-Forwarded-For'];
  if (xff) return String(xff).split(',')[0].trim() || 'unknown';
  const real = h['x-real-ip'] || h['X-Real-IP'];
  if (real) return String(real).trim();
  return (req && req.socket && req.socket.remoteAddress) || 'unknown';
}

/**
 * Enforce the limit for this request. Returns true when the request may
 * proceed; otherwise sends 429 (with Retry-After) and returns false.
 *
 *   if (!rateLimit.enforce(req, res, { scope: 'ai' })) return;              // per IP
 *   if (!rateLimit.enforce(req, res, { scope: 'ai', userId: user.id })) return; // per user
 *
 * @param {object} opts { scope: string, userId?: string, perUser?: number, perIp?: number }
 */
function enforce(req, res, opts) {
  const o = opts || {};
  const scope = o.scope || 'default';
  const key = o.userId ? `${scope}:u:${o.userId}` : `${scope}:ip:${clientIp(req)}`;
  const cap = o.userId ? (o.perUser || DEFAULT_PER_USER) : (o.perIp || DEFAULT_PER_IP);
  const r = take(key, cap);
  if (r.ok) return true;
  res.setHeader('Retry-After', String(r.retryAfter));
  send(res, 429, {
    error: 'You are sending requests too quickly. Please wait a moment and try again.',
    retry_after: r.retryAfter,
  });
  return false;
}

function _reset() { buckets.clear(); }

module.exports = {
  enforce, take, clientIp,
  DEFAULT_PER_USER, DEFAULT_PER_IP,
  _internal: { _reset, buckets, MAX_KEYS },
};
