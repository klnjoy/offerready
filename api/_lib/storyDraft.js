/**
 * "Draft it for me" in the story bank: turn a few words or a resume bullet
 * into a STAR story the user then checks and edits.
 *
 * Never invents facts: anything the notes don't say (a number, a team size, a
 * date) is left as a [bracketed question] for the user to fill in.
 * Pure helpers (prompt + parse) so they can be unit-tested without the API.
 */

'use strict';

const NOTES_MAX = 1200;
const FIELD_MAX = { title: 120, situation: 600, task: 400, action: 900, result: 500, metrics: 200 };
const TAGS = ['leadership', 'conflict', 'failure', 'ambiguity', 'influence', 'delivery', 'technical', 'customer'];

const SYSTEM = `
You turn a candidate's rough notes about something they did at work into a
STAR interview story they will check and edit.

Rules:
- Use ONLY facts in the notes. Never invent numbers, names, tools, team sizes,
  dates or outcomes. Where a story needs a fact the notes don't give, write a
  short question in square brackets, e.g. "[how many hours did it take before?]".
- First person ("I"), plain spoken English, as the candidate would say it out loud.
- Situation: 1-2 sentences. Task: 1 sentence. Action: 3-5 short steps the
  candidate took. Result: 1-2 sentences, with the number if the notes give one.
- Title: under 10 words, the outcome first (e.g. "Cut the nightly load from 6h to 40m").
- tags: 1-3 of: ${TAGS.join(', ')}.
Return ONLY JSON:
{"title":"","situation":"","task":"","action":"","result":"","metrics":"","tags":[]}
`.trim();

function clean(v, max) {
  return typeof v === 'string' ? v.replace(/\s+\n/g, '\n').trim().slice(0, max) : '';
}

function buildDraftMessages(notes, job) {
  const n = clean(notes, NOTES_MAX);
  const lines = ['NOTES:', n];
  if (job && (job.title || (job.skills && job.skills.length))) {
    lines.push('', 'JOB THEY ARE PREPARING FOR (to choose emphasis only, never as facts):');
    if (job.title) lines.push('Title: ' + clean(job.title, 120));
    if (Array.isArray(job.skills) && job.skills.length) lines.push('Skills: ' + job.skills.slice(0, 12).map((s) => clean(String(s), 40)).join(', '));
  }
  return [{ role: 'system', content: SYSTEM }, { role: 'user', content: lines.join('\n') }];
}

/** Parse the model's JSON into a safe draft, or null. */
function parseDraft(raw) {
  let o = null;
  try { o = JSON.parse(String(raw || '').replace(/^```(?:json)?|```$/g, '').trim()); } catch (_) { return null; }
  if (!o || typeof o !== 'object') return null;
  const d = {};
  for (const k of Object.keys(FIELD_MAX)) d[k] = clean(o[k], FIELD_MAX[k]);
  d.tags = Array.isArray(o.tags) ? o.tags.map((t) => String(t).toLowerCase().trim()).filter((t) => TAGS.includes(t)).slice(0, 3) : [];
  if (!d.situation && !d.action && !d.result) return null;
  return d;
}

module.exports = { buildDraftMessages, parseDraft, NOTES_MAX, TAGS };
