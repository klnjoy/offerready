/**
 * api/_lib/diagram.js — the one diagram an answer may carry (Coach answers,
 * AI topic-question model answers). Built by the model in the SAME call as the
 * answer text, then checked here against that text:
 *
 *   flow      boxes and arrows: a main path in order (3-6 boxes, one may be
 *             "key"), plus up to 2 dashed side branches from a box
 *             ("after retries fail" -> "Dead-letter queue").
 *   sequence  steps in order (3-7): a process, a rollout, an incident.
 *   tradeoff  2-3 options, each with what you gain and what it costs.
 *   compare   two approaches side by side on 2-5 axes.
 *
 * Rules enforced here (a failed rule drops the diagram; the answer stays):
 *   - never for behavioral answers;
 *   - every number in the diagram appears in the answer text;
 *   - every box / option / approach shares a real word with the answer text,
 *     so the diagram says what the text says (no second source);
 *   - sizes and lengths are clamped, unknown fields are dropped.
 */

'use strict';

const TYPES = ['flow', 'sequence', 'tradeoff', 'compare'];

const PROMPT_RULES = [
  '- "diagram": ONE diagram ONLY when it makes the answer clearer (else null):',
  '  system design, architecture, data flow, a process in steps, or a choice',
  '  between 2-3 options. NEVER for behavioral, leadership or "tell me about"',
  '  questions, and never when the text alone says it in fewer words. The',
  '  diagram carries structure, the text carries reasoning: build it from the',
  '  SAME content as your answer, with no number, name or component the text',
  '  does not state. Use one of:',
  '  { "type": "flow", "caption": string, "nodes": [{ "label": string, "key": boolean }],',
  '    "branches": [{ "from": <node index>, "edge": string, "label": string }] }',
  '    // 3-6 boxes in request/data order, labels under 4 words, one "key" box;',
  '    // branches: 0-2 dashed side paths such as a failure path',
  '  { "type": "sequence", "caption": string, "steps": [string] }   // 3-7 short steps',
  '  { "type": "tradeoff", "caption": string, "rows": [{ "choice": string, "gain": string, "cost": string }] }   // 2-3 rows',
  '  { "type": "compare", "caption": string, "left": string, "right": string,',
  '    "rows": [{ "axis": string, "left": string, "right": string }] }   // 2-5 rows',
  '  "caption": one line saying what the diagram shows.',
].join('\n');

const one = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').replace(/[*_`#]+/g, '').trim().slice(0, n);

const STOP = new Set('the and for with from into that this then when what your their them they have will would could should about over under after before each other more most less than also only just very much many some such into onto using used uses use via per its our out are was were been being does done make makes made get gets got set sets one two three all any not can may might must need needs how why who where which while within without'.split(' '));

/** Content words of a string, lightly stemmed (lowercase, trailing s/es/ing/ed). */
function words(s) {
  return (String(s || '').toLowerCase().match(/[a-z][a-z0-9+#.-]*[a-z0-9+#]|[a-z]/g) || [])
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => w.replace(/(ing|ed|es|s)$/, ''))
    .filter((w) => w.length >= 2);
}

const NUM_RE = /\d[\d,.]*/g;
const digits = (m) => m.replace(/[^\d.]/g, '').replace(/^\.+|\.+$/g, '').replace(/\.0+$/, '');

/** Every number in `labels` must appear in `text`. */
function numbersAgree(labels, text) {
  const have = new Set((String(text || '').match(NUM_RE) || []).map(digits).filter(Boolean));
  return labels.every((l) => (String(l).match(NUM_RE) || []).map(digits).filter(Boolean).every((d) => have.has(d)));
}

/** A label agrees with the text when it shares a content word with it. */
function agrees(label, textWords) {
  const w = words(label);
  return !w.length || w.some((x) => textWords.has(x));
}

/**
 * Validate a diagram against the answer it belongs to.
 * @param raw   the model's diagram object (or anything)
 * @param ctx   { text: the answer text it must agree with, kind: question type or category }
 * @returns a clean diagram, or null
 */
function validateDiagram(raw, ctx) {
  const c = ctx || {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (/behaviou?ral|leadership/i.test(String(c.kind || ''))) return null;
  const type = String(raw.type || '').toLowerCase();
  if (!TYPES.includes(type)) return null;
  const text = String(c.text || '');
  if (text.trim().length < 20) return null;
  const tw = new Set(words(text));
  const caption = one(raw.caption, 120);
  let d = null;
  let mustAgree = [];

  if (type === 'flow') {
    const nodes = (Array.isArray(raw.nodes) ? raw.nodes : []).map((n) => (typeof n === 'string' ? { label: n } : n))
      .filter((n) => n && typeof n === 'object').map((n) => ({ label: one(n.label, 32), key: n.key === true }))
      .filter((n) => n.label).slice(0, 6);
    if (nodes.length < 3) return null;
    // At most one key box.
    let seenKey = false;
    nodes.forEach((n) => { if (n.key && !seenKey) seenKey = true; else n.key = false; });
    const branches = (Array.isArray(raw.branches) ? raw.branches : []).filter((b) => b && typeof b === 'object')
      .map((b) => ({ from: Math.round(Number(b.from)), edge: one(b.edge, 32), label: one(b.label, 32) }))
      .filter((b) => Number.isInteger(b.from) && b.from >= 0 && b.from < nodes.length && b.label).slice(0, 2);
    d = { type, caption, nodes, branches };
    mustAgree = [...nodes.map((n) => n.label), ...branches.map((b) => b.label)];
  } else if (type === 'sequence') {
    const steps = (Array.isArray(raw.steps) ? raw.steps : []).map((s) => one(typeof s === 'string' ? s : s && s.label, 90)).filter(Boolean).slice(0, 7);
    if (steps.length < 3) return null;
    d = { type, caption, steps };
    mustAgree = steps;
  } else if (type === 'tradeoff') {
    const rows = (Array.isArray(raw.rows) ? raw.rows : []).filter((r) => r && typeof r === 'object')
      .map((r) => ({ choice: one(r.choice, 40), gain: one(r.gain, 90), cost: one(r.cost, 90) }))
      .filter((r) => r.choice && r.gain && r.cost).slice(0, 3);
    if (rows.length < 2) return null;
    d = { type, caption, rows };
    mustAgree = rows.map((r) => r.choice);
  } else {
    const left = one(raw.left, 40);
    const right = one(raw.right, 40);
    const rows = (Array.isArray(raw.rows) ? raw.rows : []).filter((r) => r && typeof r === 'object')
      .map((r) => ({ axis: one(r.axis, 32), left: one(r.left, 80), right: one(r.right, 80) }))
      .filter((r) => r.axis && r.left && r.right).slice(0, 5);
    if (!left || !right || rows.length < 2) return null;
    d = { type, caption, left, right, rows };
    mustAgree = [left, right];
  }

  // DIA-3: same facts as the text. No number the text doesn't state; every
  // box / option / approach named in the text.
  const allLabels = JSON.stringify(d).match(/"(?:label|edge|caption|choice|gain|cost|axis|left|right)":"[^"]*"|"steps":\[[^\]]*\]/g) || [];
  if (!numbersAgree(allLabels.map((x) => x.replace(/^"[a-z]+":/, '')), text)) return null;
  if (!mustAgree.every((l) => agrees(l, tw))) return null;
  return d;
}

module.exports = { validateDiagram, PROMPT_RULES, TYPES, _words: words };
