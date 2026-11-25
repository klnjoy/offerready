/**
 * api/_lib/referrals.js — invite friends: one personal code per account,
 * +REFERRAL_MOCK_CREDITS mock credits for the inviter AND the friend when
 * the friend signs up with the code.
 * ---------------------------------------------------------------------------
 * Flow:
 *   1. Signed-in user opens /invite: GET /api/me/plan?op=referral returns
 *      their code (created on first ask), how many friends joined with it,
 *      and how many mock credits it earned them.
 *   2. A friend opens https://getofferready.app/invite?ref=CODE, signs up,
 *      and the app calls POST /api/me/plan?op=referral-redeem { code } once
 *      (the code is stashed on the device until sign-in).
 *   3. The server grants REFERRAL_MOCK_CREDITS to both sides as
 *      credit_ledger rows (feature 'voice_mock', the same pool a mock
 *      session spends), and records the redemption so it pays out once.
 *
 * Abuse prevention:
 *   - Self-referral: the code's owner redeeming their own code is rejected
 *     (inviter == invitee), so an account can't pay itself.
 *   - One reward per new account: referral_redemptions has a unique
 *     invitee_user_id, and the grant is claimed once per invitee in the
 *     webhook_events ledger (billing.claimOnce), so a double tap, a retry
 *     after a crash, or a second friend's code all pay out at most once.
 *   - Each side's grant is idempotent on its own: the ledger source carries
 *     the invitee id (referral:inviter:<id> / referral:invitee:<id>), so a
 *     retry after a partial failure never grants the same side twice.
 *   - Codes are 8 random chars from an alphabet with no 0/O, 1/I/L, so they
 *     survive being read out loud and typed from a phone screen; guessing
 *     one is a 32^8 search, and redeeming is rate-limited per user.
 *
 * Storage (migration 0035): public.referral_codes (one code per account)
 * and public.referral_redemptions (one row per friend who joined), written
 * only here with the service-role key. Credit grants reuse the existing
 * public.credit_ledger (migration 0014).
 *
 * Known limit: one account per email is enforced by Supabase Auth, but
 * nothing here stops someone making a second account with another email
 * and redeeming their own code from it. That needs an email/domain or
 * device signal the server doesn't have — flag it, don't pretend otherwise.
 */

'use strict';

const crypto = require('crypto');
const billing = require('./billing');

// One number: what BOTH sides earn per friend who signs up with a code.
// Change it here only; /api/me/plan?op=referral sends it to the app, which
// shows it, so the page never hard-codes the amount.
const REFERRAL_MOCK_CREDITS = 1;

const CODE_LENGTH = 8;
// No 0/O, 1/I/L: codes are typed from a phone screen.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-Z2-9]{8}$/;

const TIMEOUT_MS = 8000;

// ---- storage (same shape as passes.js) ---------------------------------------

function restBase() {
  const url = process.env.SUPABASE_URL;
  return url ? url.replace(/\/+$/, '') + '/rest/v1' : null;
}

function configured() { return !!(restBase() && process.env.SUPABASE_SERVICE_ROLE_KEY); }

function svcHeaders(extra) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Object.assign({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, extra || {});
}

async function rest(path, opts) {
  if (!configured()) throw new Error('Supabase not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try { return await fetch(restBase() + path, Object.assign({ signal: controller.signal }, opts)); }
  finally { clearTimeout(timer); }
}

// ---- codes -------------------------------------------------------------------

/** 8 random chars from CODE_ALPHABET. */
function generateCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

/** Trim + uppercase; null when it can't be a code (wrong length or chars). */
function normalizeCode(raw) {
  const c = String(raw || '').trim().toUpperCase();
  return CODE_RE.test(c) ? c : null;
}

/**
 * The caller's invite code, creating one on first ask. A 409 on insert is a
 * (rare) collision with another account's code: try a fresh one.
 * Throws on storage errors.
 */
async function getOrCreateCode(userId) {
  const read = await rest(
    `/referral_codes?user_id=eq.${encodeURIComponent(userId)}&select=code`,
    { method: 'GET', headers: svcHeaders() }
  );
  if (!read.ok) throw new Error('referral_codes read ' + read.status);
  const rows = await read.json();
  if (Array.isArray(rows) && rows[0] && rows[0].code) return rows[0].code;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    const ins = await rest('/referral_codes', {
      method: 'POST',
      headers: svcHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ user_id: userId, code }),
    });
    if (ins.ok) return code;
    if (ins.status !== 409) throw new Error('referral_codes insert ' + ins.status);
  }
  throw new Error('referral code collision');
}

/** { invited, credits_earned } for one inviter. Throws on storage errors. */
async function referralStats(userId) {
  const resp = await rest(
    `/referral_redemptions?inviter_user_id=eq.${encodeURIComponent(userId)}&select=id`,
    { method: 'GET', headers: svcHeaders() }
  );
  if (!resp.ok) throw new Error('referral_redemptions read ' + resp.status);
  const rows = await resp.json();
  const invited = Array.isArray(rows) ? rows.length : 0;
  return { invited, credits_earned: invited * REFERRAL_MOCK_CREDITS };
}

// ---- grants ------------------------------------------------------------------

/**
 * Grant one side's credits, once: the ledger source carries the invitee id,
 * so a retry after a partial failure finds the row and skips the insert.
 * @returns {Promise<{ granted: boolean, duplicate?: boolean }>}
 */
async function grantOnce(userId, source) {
  const read = await rest(
    `/credit_ledger?user_id=eq.${encodeURIComponent(userId)}` +
      `&source=eq.${encodeURIComponent(source)}&select=id&limit=1`,
    { method: 'GET', headers: svcHeaders() }
  );
  if (!read.ok) throw new Error('credit_ledger read ' + read.status);
  const rows = await read.json();
  if (Array.isArray(rows) && rows.length > 0) return { granted: false, duplicate: true };
  const ins = await rest('/credit_ledger', {
    method: 'POST',
    headers: svcHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ user_id: userId, feature: 'voice_mock', delta: REFERRAL_MOCK_CREDITS, source }),
  });
  if (ins.status === 409) return { granted: false, duplicate: true };
  if (!ins.ok) throw new Error('credit insert ' + ins.status);
  return { granted: true };
}

/**
 * Redeem a friend's invite code for the signed-in user.
 * @returns {Promise<{ ok: boolean, granted?: number, reason?: 'invalid'|'self'|'duplicate' }>}
 * Never returns ok:true twice for one invitee. Throws on storage errors.
 */
async function redeemCode(userId, rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, reason: 'invalid' };
  const found = await rest(
    `/referral_codes?code=eq.${encodeURIComponent(code)}&select=user_id`,
    { method: 'GET', headers: svcHeaders() }
  );
  if (!found.ok) throw new Error('referral_codes read ' + found.status);
  const owners = await found.json();
  const inviter = Array.isArray(owners) && owners[0] && owners[0].user_id;
  if (!inviter) return { ok: false, reason: 'invalid' };
  // Self-referral: your own code pays nobody.
  if (inviter === userId) return { ok: false, reason: 'self' };
  const prior = await rest(
    `/referral_redemptions?invitee_user_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
    { method: 'GET', headers: svcHeaders() }
  );
  if (!prior.ok) throw new Error('referral_redemptions read ' + prior.status);
  const priorRows = await prior.json();
  if (Array.isArray(priorRows) && priorRows.length > 0) return { ok: false, reason: 'duplicate' };
  // Claim once per invitee, so a double tap or a retry can't pay out twice.
  const key = 'referral:' + userId;
  const fresh = await billing.claimOnce(key, 'referral.granted', { code, inviter_user_id: inviter, invitee_user_id: userId });
  if (!fresh) return { ok: false, reason: 'duplicate' };
  try {
    await grantOnce(inviter, 'referral:inviter:' + userId);
    await grantOnce(userId, 'referral:invitee:' + userId);
    const ins = await rest('/referral_redemptions', {
      method: 'POST',
      headers: svcHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        code, inviter_user_id: inviter, invitee_user_id: userId,
        granted_at: new Date().toISOString(),
      }),
    });
    if (ins.status === 409) return { ok: false, reason: 'duplicate' };
    if (!ins.ok) throw new Error('referral_redemptions insert ' + ins.status);
    return { ok: true, granted: REFERRAL_MOCK_CREDITS };
  } catch (err) {
    await billing.releaseClaim(key);
    throw err;
  }
}

module.exports = {
  REFERRAL_MOCK_CREDITS, CODE_LENGTH, CODE_ALPHABET,
  generateCode, normalizeCode,
  getOrCreateCode, referralStats, redeemCode,
  configured,
  _internal: { grantOnce },
};
