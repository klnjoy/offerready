/**
 * "Fill it in for me" on the interview debrief: the user's own recap of a real
 * interview -> the questions they were asked, how each one went, and notes.
 *
 * Only what the recap says: never adds questions the user didn't mention,
 * never guesses a rating the recap gives no hint about ("" = not rated).
 * Pure helpers (prompt + parse) for unit tests.
 */

'use strict';

const RECAP_MAX = 3000;
const ROUNDS = ['recruiter', 'technical', 'system_design', 'behavioral', 'onsite', 'hiring_manager'];

const SYSTEM = `
You turn a candidate's own recap of a real job interview into a structured debrief.

Rules:
- List ONLY questions the recap says were asked. Never add likely or typical
  questions. Rephrase each as the interviewer would have asked it, in one line.
- rating per question, from the recap only: "good" (went well), "ok" (partly),
  "bad" (struggled, didn't know, ran out of time), or "" when the recap gives
  no hint.
- note per question: what the candidate said about their answer or what to
  improve, in their words, short. "" if nothing.
- feeling: 1 (rough) to 5 (great) only if the recap says how it felt overall, else 0.
- round: one of ${ROUNDS.join(', ')}, or "" if unclear.
- notes: anything else worth remembering (team, next steps, follow-ups), short.
Return ONLY JSON:
{"questions":[{"text":"","rating":"","note":""}],"feeling":0,"round":"","notes":""}
`.trim();

const s = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function buildFillMessages(recap, job) {
  const lines = ['RECAP:', String(recap || '').slice(0, RECAP_MAX)];
  if (job && job.title) lines.push('', 'Job: ' + s(job.title, 120));
  return [{ role: 'system', content: SYSTEM }, { role: 'user', content: lines.join('\n') }];
}

function parseFill(raw) {
  let o = null;
  try { o = JSON.parse(String(raw || '').replace(/^```(?:json)?|```$/g, '').trim()); } catch (_) { return null; }
  if (!o || typeof o !== 'object') return null;
  const questions = (Array.isArray(o.questions) ? o.questions : [])
    .map((q) => ({
      text: s(q && q.text, 400),
      rating: q && ['good', 'ok', 'bad'].includes(q.rating) ? q.rating : '',
      note: s(q && q.note, 400),
    }))
    .filter((q) => q.text)
    .slice(0, 40);
  const feeling = Number.isInteger(o.feeling) && o.feeling >= 1 && o.feeling <= 5 ? o.feeling : 0;
  const round = ROUNDS.includes(o.round) ? o.round : '';
  const notes = s(o.notes, 1500);
  if (!questions.length && !notes) return null;
  return { questions, feeling, round, notes };
}

module.exports = { buildFillMessages, parseFill, RECAP_MAX };
