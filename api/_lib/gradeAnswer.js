/**
 * api/_lib/gradeAnswer.js — build + validate AI feedback on a candidate's OWN
 * answer to a Defend node. This is the feature that turns OfferReady from a
 * study guide into an interviewer: it grades what the user actually wrote
 * against the node's real signals, not a generic rubric.
 *
 * Anti-fabrication posture (spec: "Do not fabricate AI"):
 *   - The model grades ONLY against the provided prompt + strong-answer signals.
 *     It is instructed not to invent facts and to score honestly.
 *   - If the answer is empty, off-topic, or too short to assess, it must say so
 *     and score low rather than inventing praise.
 *   - Output is structurally validated here; malformed output is rejected so
 *     the caller fails closed (no fake feedback surfaced).
 *
 * The caller owns the LLM fetch; this module only builds messages + validates.
 */

'use strict';

const SYSTEM_PROMPT = [
  'You are a demanding senior technical interviewer grading a candidate\'s',
  'spoken-style answer to ONE interview question. You are fair but not',
  'flattering: a real interview does not hand out participation points.',
  '',
  'You are given the QUESTION, the SIGNALS a strong answer should show, and a',
  'reference STRONG ANSWER. Grade the CANDIDATE ANSWER against those.',
  '',
  'HARD RULES:',
  '- Judge ONLY what the candidate actually wrote. Do not invent claims they',
  '  did not make or credit them for things they did not say.',
  '- If the answer is empty, off-topic, or too vague to assess, score it low',
  '  (0-30) and say plainly that it would not hold up. Never fabricate praise.',
  '- Be specific: reference the actual signals, name what was covered and what',
  '  was missing.',
  '- End with ONE sharp follow-up question a real interviewer would ask next to',
  '  pressure-test the weakest part of their answer.',
  '- Output JSON ONLY, no markdown, matching the schema exactly.',
  '',
  'SCHEMA:',
  '{',
  '  "score": integer 0-100,          // honest strength of THIS answer',
  '  "verdict": string,               // one blunt sentence: would it hold up?',
  '  "covered": [string],             // signals/points the answer actually hit (may be empty)',
  '  "missing": [string],             // signals/points it missed or hand-waved',
  '  "followup": string               // the next "why/how" an interviewer would push',
  '}',
].join('\n');

/** Build the user message from the node + the candidate's answer (capped). */
function buildUserMessage(input) {
  const { prompt, signals, model, answer } = input || {};
  const sig = Array.isArray(signals)
    ? signals.filter((s) => typeof s === 'string' && s.trim()).slice(0, 6)
    : [];
  return [
    'QUESTION:',
    String(prompt || '').slice(0, 1200),
    '',
    'SIGNALS A STRONG ANSWER SHOWS:',
    sig.length ? sig.map((s) => '- ' + s).join('\n') : '(none provided)',
    '',
    'REFERENCE STRONG ANSWER:',
    String(model || '').slice(0, 1600),
    '',
    'CANDIDATE ANSWER:',
    String(answer || '').slice(0, 2500) || '(the candidate left this blank)',
    '',
    'Grade the candidate answer now as strict JSON.',
  ].join('\n');
}

/** Clamp to an integer in [lo, hi]. */
function clampInt(n, lo, hi) {
  n = Math.round(Number(n));
  if (!isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Validate + normalize the model's grade object. Returns { ok, feedback } or
 * { ok:false, reason }. Fail closed on anything structurally wrong.
 */
function validateGrade(parsed) {
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'not-object' };
  if (typeof parsed.score !== 'number' && typeof parsed.score !== 'string') {
    return { ok: false, reason: 'no-score' };
  }
  const verdict = typeof parsed.verdict === 'string' ? parsed.verdict.trim() : '';
  const followup = typeof parsed.followup === 'string' ? parsed.followup.trim() : '';
  if (!verdict) return { ok: false, reason: 'no-verdict' };

  const arr = (v) => (Array.isArray(v)
    ? v.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim()).slice(0, 6)
    : []);

  return {
    ok: true,
    feedback: {
      score: clampInt(parsed.score, 0, 100),
      verdict: verdict.slice(0, 400),
      covered: arr(parsed.covered),
      missing: arr(parsed.missing),
      followup: followup.slice(0, 400),
    },
  };
}

module.exports = { SYSTEM_PROMPT, buildUserMessage, validateGrade };
