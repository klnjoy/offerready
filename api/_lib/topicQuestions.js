/**
 * topic_questions: five fresh interview questions on one bank topic, each
 * with a short model answer, written by AI on request (Question bank →
 * "AI questions on a topic"). Kept apart from the curated bank: the bank is
 * fixed and reviewed; these are new each time and labelled as AI-written.
 * Optional job title steers them toward that role. Questions already in the
 * bank for the topic are passed as `avoid` so they aren't repeated.
 */

'use strict';

const COUNT = 5;

const SYSTEM_PROMPT = [
  'You write realistic technical interview questions for job seekers, with short model answers.',
  'Return JSON only: {"questions":[{"q":"...","a":"...","difficulty":"easy|medium|hard"}]}.',
  'Rules:',
  '- Exactly ' + COUNT + ' questions on the given topic, each one different in what it tests (concepts, trade-offs, debugging, design, a scenario).',
  '- Ask what interviewers actually ask for this topic today; no trivia, no product news or prices.',
  '- Each answer: 3 to 6 sentences an interviewer would accept, plain English, may use `code` for names. Be factually careful; if something depends on version or setup, say so.',
  '- Mix difficulty: at least one easy and one hard.',
  '- Do not repeat or lightly reword any question in the "avoid" list.',
  '- If a job title is given, lean the questions toward what that role would be asked, still on the topic.',
  '- Behavioral topics: ask situation questions ("Tell me about a time…") and give an answer outline using STAR, never invented personal facts.',
].join('\n');

function clean(s, max) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max); }

/** Validates the request body; returns { ok, input } or { ok:false, error }. */
function readInput(body) {
  const topic = clean(body && body.topic, 80);
  if (topic.length < 2) return { ok: false, error: 'Pick a topic first.' };
  const jobTitle = clean(body && body.jobTitle, 120);
  const avoid = Array.isArray(body && body.avoid)
    ? body.avoid.filter((x) => typeof x === 'string').map((x) => clean(x, 200)).filter(Boolean).slice(0, 40)
    : [];
  return { ok: true, input: { topic, jobTitle, avoid } };
}

function buildUserMessage(input) {
  const lines = ['Topic: ' + input.topic];
  if (input.jobTitle) lines.push('Job title: ' + input.jobTitle);
  if (input.avoid.length) lines.push('Avoid (already in the bank):\n- ' + input.avoid.join('\n- '));
  return lines.join('\n');
}

/** Keeps well-formed, non-repeated questions; ok when at least 3 survive. */
function validate(parsed, input) {
  const raw = parsed && Array.isArray(parsed.questions) ? parsed.questions : [];
  const key = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const seen = new Set((input.avoid || []).map(key));
  const out = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const q = clean(x.q || x.question, 400);
    const a = String(x.a || x.answer || '').trim().slice(0, 1600);
    if (q.length < 10 || a.length < 20) continue;
    const k = key(q);
    if (seen.has(k)) continue;
    seen.add(k);
    const d = String(x.difficulty || 'medium').toLowerCase();
    out.push({ q, a, topic: input.topic, difficulty: ['easy', 'medium', 'hard'].includes(d) ? d : 'medium' });
    if (out.length === COUNT) break;
  }
  return out.length >= 3 ? { ok: true, questions: out } : { ok: false };
}

module.exports = { SYSTEM_PROMPT, COUNT, readInput, buildUserMessage, validate };
