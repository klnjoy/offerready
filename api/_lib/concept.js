/**
 * The concept block (ANS-1..ANS-3): a short intro to the concept a question is
 * about, shown above the answer. Answer depth, not a course: three short parts
 * in plain words. The app links it to the library's own page for the concept
 * when one exists (by name), and never otherwise.
 */

'use strict';

const PROMPT_RULES = [
  '- "concept": the ONE concept this question is really about (a technology,',
  '  technique or idea, e.g. "Retrieval-augmented generation (RAG)", "Incremental',
  '  models in dbt", "STAR answers"), explained for a first-timer in plain words.',
  '  { "name": string (2-6 words), "what": string (ONE plain line, what it is),',
  '  "why": string (2-3 short sentences: the problem it solves, why it exists),',
  '  "rule": string (1-2 sentences: when to use it and when not to) }. No jargon',
  '  without a plain gloss in the same line. General knowledge only, never claims',
  '  about the candidate. Use null only when the question has no concept at all.',
].join('\n');

const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

/** A valid concept block, or null. All three parts are required. */
function conceptOf(c) {
  if (!c || typeof c !== 'object') return null;
  const name = clip(c.name, 80);
  const what = clip(c.what, 220);
  const why = clip(c.why, 420);
  const rule = clip(c.rule, 300);
  if (!name || !what || !why || !rule) return null;
  return { name, what, why, rule };
}

module.exports = { PROMPT_RULES, conceptOf };
