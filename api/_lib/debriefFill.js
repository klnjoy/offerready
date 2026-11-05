/**
 * "Fill it in for me" on the interview debrief: the user's own recap of a real
 * interview -> the questions they were asked, how each one went, and notes.
 *
 * Only what the recap says: never adds questions the user didn't mention,
 * never guesses a rating the recap gives no hint about ("" = not rated).
 * Pure helpers (prompt + parse) for unit tests.
 */

'use strict';

const RECAP_MAX = 6000; // typed or spoken recap (a 3-minute spoken recap fits)
const TRANSCRIPT_MAX = 60000; // a meeting transcript the candidate was given (about an hour)
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

const TRANSCRIPT_SYSTEM = `
You turn the transcript of a real job interview into a structured debrief for
the candidate. The candidate supplied this transcript (the meeting tool or the
company produced it, or they had permission). It may have speaker names,
timestamps or caption fragments.

Rules:
- List the questions the INTERVIEWER asked, in order, including real follow-ups.
  Skip small talk, logistics and the candidate's own questions. Never add
  questions that are not in the transcript. One line each, as asked.
- note per question: one short line on how the candidate answered (the key
  point they made), then, if something obvious was missing or unclear, what to
  strengthen next time. Base it ONLY on the transcript. "" if unclear.
- rating: "" unless the transcript itself makes it plain (the candidate said
  they didn't know: "bad"; the interviewer clearly praised it: "good").
- feeling: 0 (a transcript doesn't say how it felt).
- round: one of ${ROUNDS.join(', ')}, or "" if unclear.
- notes: who the interviewers were, next steps or anything promised, short.
Return ONLY JSON:
{"questions":[{"text":"","rating":"","note":""}],"feeling":0,"round":"","notes":""}
`.trim();

/** A meeting transcript as the model sees it: no caption numbering or timestamps. */
function cleanTranscript(t) {
  return String(t || '')
    .replace(/^WEBVTT.*$/gm, '')
    .replace(/^\d+\s*$/gm, '')
    .replace(/^\s*\d{1,2}:\d{2}(?::\d{2})?[.,]?\d*\s*-->.*$/gm, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildTranscriptMessages(transcript, job) {
  const lines = ['TRANSCRIPT:', cleanTranscript(transcript).slice(0, TRANSCRIPT_MAX)];
  if (job && job.title) lines.push('', 'Job: ' + s(job.title, 120));
  return [{ role: 'system', content: TRANSCRIPT_SYSTEM }, { role: 'user', content: lines.join('\n') }];
}

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

module.exports = { buildFillMessages, buildTranscriptMessages, cleanTranscript, parseFill, RECAP_MAX, TRANSCRIPT_MAX };
