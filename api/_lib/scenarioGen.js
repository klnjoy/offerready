/**
 * api/_lib/scenarioGen.js — build + validate an LLM-generated Defend scenario.
 * ---------------------------------------------------------------------------
 * Turns a user's analyzed job into a defend-your-decision scenario tree in the
 * EXACT schema the frontend engine (content/assets/scenario.js) renders, so a
 * generated scenario runs through the same startRun()/renderNode() path as the
 * authored ones — no client changes needed.
 *
 * Anti-fabrication posture (spec: "Do not fabricate AI"):
 *   - The system prompt forbids inventing employer facts; it must ground every
 *     node in the provided job description / analysis and stay role-generic
 *     where the JD is silent.
 *   - The model output is STRUCTURALLY VALIDATED here. Anything malformed is
 *     rejected so the caller can fail closed to the authored scenario rather
 *     than surface a broken/hallucinated tree.
 *
 * No storage, no logging of JD text. One LLM call per generation (caller owns
 * the fetch); this module only builds the messages and validates the result.
 */

'use strict';

// Node kinds the frontend engine knows how to render. Keep in sync with
// renderNode() in content/assets/scenario.js.
const ANSWER_KINDS = ['decision', 'why', 'tradeoff', 'constraint', 'incident'];
const ALL_KINDS = ANSWER_KINDS.concat(['reflection', 'next_drill']);

const MAX_NODES = 10;
const MIN_NODES = 6;

const SYSTEM_PROMPT = [
  'You are an expert technical interviewer for senior engineering roles.',
  'Given a job description and a structured analysis, produce ONE "defend your',
  'decision" interview scenario as STRICT JSON. The candidate will answer each',
  'node out loud, reveal a strong answer, and self-rate.',
  '',
  'HARD RULES:',
  '- Ground every prompt in the provided job description and analysis. Do NOT',
  '  invent employer names, products, metrics, or facts that are not implied by',
  '  the input. Where the JD is silent, stay role-generic.',
  '- Output JSON ONLY, matching the schema below. No prose, no markdown.',
  '- Build a connected chain: each node (except the last) has a "next" pointing',
  '  to the id of the following node. "start" names the first node id.',
  '- Use 8-10 nodes in this order of kinds where possible: decision, then a mix',
  '  of why / tradeoff / constraint / incident, then one "reflection", then one',
  '  "next_drill" as the final node.',
  '',
  'WHAT MAKES A GOOD DRILL:',
  '- Pick ONE concrete situation from this job\'s core technical work (e.g. for a',
  '  forward deployed engineer: deploying a tool-using LLM app into a customer\'s',
  '  environment behind their SSO). Every node stays in that SAME situation.',
  '- The "decision" node asks the candidate to choose between 2-3 real',
  '  architecture or delivery options with different consequences (e.g. "run',
  '  inference in the customer VPC or your managed cloud", "sync vs event-driven",',
  '  "fine-tune vs RAG"). Name the options in the prompt.',
  '- NEVER ask about programming-language preference, generic tooling taste, or',
  '  pure soft skills ("how do you improve communication"). Those are not',
  '  trade-off decisions. Soft-skill gaps belong in behavioral practice, not here.',
  '- "constraint" changes the situation (new compliance rule, 10x load, smaller',
  '  budget, customer forbids data leaving their network) and asks what changes.',
  '- "incident" is a specific production failure in this design and asks how',
  '  the candidate detects, mitigates and prevents it.',
  '- "reflection" checklist items are concrete technical review points for THIS',
  '  design (e.g. "Token scopes reviewed for every tool"), not generic habits.',
  '- "title" names the situation (e.g. "Customer-hosted LLM assistant behind',
  '  Okta SSO"), never "Defend your decision for <role>".',
  '',
  'SCHEMA:',
  '{',
  '  "title": string,',
  '  "start": string,               // id of the first node',
  '  "nodes": {',
  '    "<id>": {',
  '      "id": string,',
  '      "kind": "decision"|"why"|"tradeoff"|"constraint"|"incident"|"reflection"|"next_drill",',
  '      "prompt": string,          // the question posed to the candidate',
  '      "model": string,           // strong answer (for answer kinds)',
  '      "signals": [string],       // 2-4 things a strong answer shows (answer kinds)',
  '      "checklist": [string],     // for "reflection" only',
  '      "recommend": [{"label": string, "path": string}], // for "next_drill" only',
  '      "next": string             // id of the next node (omit on the final node)',
  '    }',
  '  }',
  '}',
].join('\n');

/** Build the OpenAI user message from the (already length-capped) inputs. */
function buildUserMessage(input) {
  const { jobDescription, targetRole, analysis } = input || {};
  const a = analysis || {};
  const skills = (a.coreSkills || [])
    .map((s) => (typeof s === 'string' ? s : s && s.name))
    .filter(Boolean);
  const techs = (a.technologies || []).filter(Boolean);
  // Technical gaps only: soft skills ("communication") make poor trade-off drills.
  const SOFT = /\b(communicat|collaborat|interpersonal|teamwork|presentation|stakeholder management|soft skill|leadership skill|mentor)/i;
  const gaps = []
    .concat(Array.isArray(input && input.gapFocus) ? input.gapFocus : [])
    .concat((a.potentialGaps || []).map((g) => g && g.requirement))
    .concat((a.preparationPlan || []).map((p) => p && p.title))
    .filter((x) => typeof x === 'string' && x.trim() && !SOFT.test(x))
    .filter((x, i, all) => all.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);

  return [
    'TARGET ROLE: ' + (targetRole || a.jobTitle || a.seniority || 'unspecified'),
    a.seniority ? 'SENIORITY: ' + a.seniority : '',
    a.roleSummary ? 'ROLE SUMMARY: ' + a.roleSummary : '',
    skills.length ? 'CORE SKILLS: ' + skills.slice(0, 12).join(', ') : '',
    techs.length ? 'TECHNOLOGIES: ' + techs.slice(0, 12).join(', ') : '',
    gaps.length ? 'CANDIDATE GAPS TO PRESSURE-TEST: ' + gaps.slice(0, 8).join('; ') : '',
    '',
    'JOB DESCRIPTION:',
    (jobDescription || '').slice(0, 6000),
    '',
    'Produce the scenario JSON now. Make the decisions specific to THIS role and',
    'stack; pressure-test the candidate\'s technical gaps in the why/tradeoff/',
    'constraint/incident nodes. No language-choice or soft-skill questions.',
  ].filter(Boolean).join('\n');
}

/**
 * Validate + normalize a parsed model object into a safe scenario tree.
 * Returns { ok:true, content } or { ok:false, reason }. Fail closed on anything
 * structurally wrong so the caller can fall back to the authored scenario.
 */
function validateTree(parsed) {
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'not-object' };
  const nodes = parsed.nodes;
  const start = parsed.start;
  if (!nodes || typeof nodes !== 'object') return { ok: false, reason: 'no-nodes' };
  const ids = Object.keys(nodes);
  if (ids.length < MIN_NODES || ids.length > MAX_NODES) return { ok: false, reason: 'node-count' };
  if (!start || !nodes[start]) return { ok: false, reason: 'bad-start' };

  const clean = {};
  let answerable = 0;
  for (const id of ids) {
    const n = nodes[id] || {};
    const kind = String(n.kind || '').toLowerCase();
    if (ALL_KINDS.indexOf(kind) === -1) return { ok: false, reason: 'bad-kind:' + kind };
    if (typeof n.prompt !== 'string' || !n.prompt.trim()) return { ok: false, reason: 'no-prompt' };

    const node = { id: String(id), kind: kind, prompt: n.prompt.trim() };

    if (ANSWER_KINDS.indexOf(kind) !== -1) {
      answerable++;
      node.model = typeof n.model === 'string' ? n.model.trim() : '';
      node.signals = Array.isArray(n.signals)
        ? n.signals.filter((s) => typeof s === 'string' && s.trim()).slice(0, 5)
        : [];
    } else if (kind === 'reflection') {
      node.checklist = Array.isArray(n.checklist)
        ? n.checklist.filter((s) => typeof s === 'string' && s.trim()).slice(0, 8)
        : [];
    } else if (kind === 'next_drill') {
      node.recommend = Array.isArray(n.recommend)
        ? n.recommend
            .filter((r) => r && typeof r.label === 'string')
            .map((r) => ({ label: r.label.trim(), path: typeof r.path === 'string' ? r.path : '' }))
            .slice(0, 5)
        : [];
    }

    // `next` must point to a real node (validated in a second pass). next_drill
    // is terminal, so it may omit next.
    if (n.next != null) node.next = String(n.next);
    clean[node.id] = node;
  }

  if (answerable < 3) return { ok: false, reason: 'too-few-answerable' };

  // Second pass: every `next` must resolve, and the chain from `start` must be
  // acyclic and reach a terminal node (no `next`).
  for (const id of Object.keys(clean)) {
    const nx = clean[id].next;
    if (nx && !clean[nx]) return { ok: false, reason: 'dangling-next:' + nx };
  }
  const seen = {};
  let cur = start, hops = 0;
  while (cur && clean[cur] && hops <= ids.length + 1) {
    if (seen[cur]) return { ok: false, reason: 'cycle' };
    seen[cur] = 1;
    cur = clean[cur].next;
    hops++;
  }
  if (cur && !clean[cur]) return { ok: false, reason: 'chain-escapes' };

  return { ok: true, content: { start: String(start), nodes: clean } };
}

module.exports = {
  SYSTEM_PROMPT,
  buildUserMessage,
  validateTree,
  ANSWER_KINDS,
  ALL_KINDS,
  MAX_NODES,
  MIN_NODES,
};
