/**
 * api/_lib/readinessAi.js — prompts + validators for the Interview Readiness
 * Platform AI actions (gap analysis, JD question generation).
 * ---------------------------------------------------------------------------
 * The endpoint (api/ai.js) owns the OpenAI fetch + auth; this module only
 * builds messages and structurally validates model output, so malformed output
 * is rejected (fail closed) rather than surfaced.
 *
 * Anti-fabrication posture (spec: "Do not fabricate AI"):
 *   - Prompts require grounding in the provided JD/resume signals only.
 *   - No raw resume text is stored anywhere; the caller passes text transiently
 *     for the single analysis call.
 */

'use strict';

// ===========================================================================
// GAP ANALYSIS — resume signals vs JD -> match score + gaps + readiness bands.
// ===========================================================================

const GAP_SYSTEM_PROMPT = [
  'You are a senior technical recruiter and hiring manager. Compare a',
  'candidate against a specific job and report an honest readiness picture.',
  '',
  'You are given the JOB (title + description) and the CANDIDATE (resume text or',
  'distilled resume signals). Judge only what is present. Do not invent',
  'experience the candidate did not state, and do not inflate the match.',
  '',
  'Return STRICT JSON only (no markdown), matching this schema:',
  '{',
  '  "matchScore": integer 0-100,        // overall resume<->JD fit',
  '  "technicalScore": integer 0-100,    // hard-skill / tooling readiness',
  '  "behavioralScore": integer 0-100,   // leadership/communication signals',
  '  "architectureScore": integer 0-100, // system design / scale signals',
  '  "domainScore": integer 0-100,       // domain/industry fit',
  '  "strengths": [string],              // things the candidate clearly has (JD-relevant)',
  '  "missingSkills": [string],          // required skills not evidenced',
  '  "missingKeywords": [string],        // JD keywords absent from the resume',
  '  "missingExperience": [string],      // experience signals the JD wants but resume lacks',
  '  "summary": string                   // 1-2 sentences, blunt and useful',
  '}',
  '',
  'If the resume is thin or missing, score low and say so plainly.',
  '',
  'HOW TO WRITE EACH LIST ITEM (people scan these as chips):',
  '- A short noun phrase, 2 to 6 words, in plain words. No full sentences.',
  '- Name the concrete thing: "Kafka", "C-level stakeholder management",',
  '  "Systems integrator partnerships", not a description of it.',
  '- Never start with filler: "Experience with/in", "Ability to", "Proven track',
  '  record of", "Strong", "Hands-on", "Familiarity with", "Specific",',
  '  "Demonstrated", "Excellent", "Knowledge of".',
  '- strengths: what the resume actually shows, with the evidence in a few',
  '  words, e.g. "Python and AWS data pipelines (15 years)", "OpenAI API in',
  '  production (500 daily users)". Only use numbers that are in the resume.',
  '- missingKeywords: exact terms from the job description (1 to 4 words),',
  '  as written there.',
  '- Do not repeat the same idea in two lists.',
  '- summary: second person ("You..."), 1 to 2 short sentences, no buzzwords.',
].join('\n');

function buildGapUserMessage(input) {
  const { jobTitle, jobDescription, resumeText, resumeSignals } = input || {};
  const sig = resumeSignals && typeof resumeSignals === 'object' ? resumeSignals : null;
  const sigLines = sig
    ? [
        sig.skills && sig.skills.length ? 'Resume skills: ' + sig.skills.slice(0, 30).join(', ') : '',
        sig.seniority ? 'Resume seniority: ' + sig.seniority : '',
      ].filter(Boolean).join('\n')
    : '';
  return [
    'JOB TITLE: ' + String(jobTitle || 'unspecified').slice(0, 200),
    '',
    'JOB DESCRIPTION:',
    String(jobDescription || '').slice(0, 6000),
    '',
    'CANDIDATE RESUME:',
    // 12k chars covers a full two-page resume: bullets near the end (often
    // the ones just tailored) used to be cut off, so a re-check never moved.
    String(resumeText || '').slice(0, 12000) || sigLines || '(no resume provided)',
    '',
    'Compare and return the gap analysis JSON now.',
  ].join('\n');
}

function clampInt(n, lo, hi) {
  n = Math.round(Number(n));
  if (!isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

// Filler some models still add at the start of a chip, removed so every item
// reads as a short label ("Kafka", not "Experience with Kafka").
const FILLER = /^(?:(?:proven|demonstrated|strong|solid|deep|extensive|excellent|hands-on|specific|prior|relevant|direct|good|working|practical)\s+)*(?:track record (?:of|in)\s+|ability to\s+|experience (?:with|in|of|on)\s+|experience\s+(?=[a-z]+ing\b)|familiarity with\s+|knowledge of\s+|understanding of\s+|expertise in\s+|proficiency (?:in|with)\s+)?/i;
function tidy(s) {
  let t = String(s).trim().replace(/\s+/g, ' ').replace(/[.;]+$/, '');
  const cut = t.replace(FILLER, '');
  if (cut.length >= 3) t = cut;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function strArr(v, max) {
  return Array.isArray(v)
    ? v.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim().slice(0, 160)).slice(0, max || 12)
    : [];
}

/** Drop exact repeats (case-insensitive) across the lists, first one wins. */
function dedupeLists(o) {
  const seen = new Set();
  const out = {};
  for (const k of Object.keys(o)) {
    out[k] = o[k].filter((x) => { const n = x.toLowerCase(); if (seen.has(n)) return false; seen.add(n); return true; });
  }
  return out;
}

function validateGap(parsed) {
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'not-object' };
  if (parsed.matchScore == null) return { ok: false, reason: 'no-score' };
  return {
    ok: true,
    result: {
      matchScore: clampInt(parsed.matchScore, 0, 100),
      technicalScore: clampInt(parsed.technicalScore, 0, 100),
      behavioralScore: clampInt(parsed.behavioralScore, 0, 100),
      architectureScore: clampInt(parsed.architectureScore, 0, 100),
      domainScore: clampInt(parsed.domainScore, 0, 100),
      ...dedupeLists({
        strengths: strArr(parsed.strengths, 12).map(tidy),
        missingSkills: strArr(parsed.missingSkills, 12).map(tidy),
        missingKeywords: strArr(parsed.missingKeywords, 15).map((k) => String(k).trim().replace(/[.;]+$/, '')),
        missingExperience: strArr(parsed.missingExperience, 10).map(tidy),
      }),
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 500) : '',
    },
  };
}

// ===========================================================================
// QUESTION GENERATION — JD -> categorized interview questions with difficulty.
// ===========================================================================

// Target counts per category (spec: 10 technical, 10 behavioral, 5 system
// design, 5 leadership).
// A first set of 16 comes back in about half the time of 30; "Get more
// questions" adds another set that doesn't repeat it.
const QUESTION_TARGETS = {
  technical: 6,
  behavioral: 5,
  system_design: 3,
  leadership: 2,
};
const VALID_CATEGORIES = Object.keys(QUESTION_TARGETS);
const VALID_DIFFICULTY = ['easy', 'medium', 'hard'];

const QUESTIONS_SYSTEM_PROMPT = [
  'You are an interview panel designing questions for a SPECIFIC job. Generate',
  'realistic questions this candidate would actually be asked, grounded in the',
  'job description. Do not invent proprietary company details.',
  '',
  'Produce STRICT JSON only (no markdown):',
  '{',
  '  "questions": [',
  '    { "category": "technical"|"behavioral"|"system_design"|"leadership",',
  '      "difficulty": "easy"|"medium"|"hard",',
  '      "prompt": string }',
  '  ]',
  '}',
  '',
  'Required counts: ' + Object.keys(QUESTION_TARGETS).map((c) => QUESTION_TARGETS[c] + ' ' + c).join(', ') + '.',
  'Technical questions must reference the actual skills/tech in the JD. System',
  'design questions must be scenario-based. Behavioral/leadership must be STAR-',
  'style. Vary difficulty realistically for the role seniority.',
].join('\n');

// Short, de-duped list helper for prompt context (cap count + per-item length).
function ctxList(arr, max, itemLen) {
  if (!Array.isArray(arr)) return [];
  const seen = {};
  const out = [];
  for (const raw of arr) {
    const v = (typeof raw === 'string' ? raw : (raw && (raw.name || raw.title || raw.requirement || raw.skill)) || '');
    const s = String(v || '').trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen[key]) continue;
    seen[key] = 1;
    out.push(s.slice(0, itemLen || 80));
    if (out.length >= (max || 12)) break;
  }
  return out;
}

/**
 * Build the question-generation user message. Beyond the JD, we now inject the
 * ANALYZED JOB CONTEXT when available — required technologies, core skills, and
 * the gap-analysis focus (missing skills / keywords / experience). This makes a
 * Data Engineer set materially differ from an AI Engineer set even when the JD
 * prose is similar, and biases questions toward the candidate's actual gaps.
 * It does NOT change the output contract (same 10/10/5/5 categories).
 */
function buildQuestionsUserMessage(input) {
  const {
    jobTitle, seniority, jobDescription,
    technologies, coreSkills, missingSkills, missingKeywords, missingExperience, avoid, otherJobs, company,
  } = input || {};
  const otherList = Array.isArray(otherJobs) ? otherJobs.filter((x) => typeof x === 'string' && x.trim()).slice(0, 30).map((x) => x.trim().slice(0, 140)) : [];
  const counts = Object.keys(QUESTION_TARGETS).map((c) => QUESTION_TARGETS[c] + ' ' + c).join(', ');
  const avoidList = Array.isArray(avoid) ? avoid.filter((x) => typeof x === 'string' && x.trim()).slice(0, 60).map((x) => x.trim().slice(0, 160)) : [];

  const techs = ctxList(technologies, 15, 60);
  const skills = ctxList(coreSkills, 15, 80);
  const gapFocus = ctxList(
    [].concat(missingSkills || [], missingKeywords || [], missingExperience || []),
    15, 80
  );

  return [
    'JOB TITLE: ' + String(jobTitle || 'unspecified').slice(0, 200),
    company ? 'COMPANY: ' + String(company).slice(0, 120) : '',
    seniority ? 'SENIORITY: ' + String(seniority).slice(0, 120) : '',
    techs.length ? 'REQUIRED TECHNOLOGIES: ' + techs.join(', ') : '',
    skills.length ? 'CORE SKILLS: ' + skills.join(', ') : '',
    gapFocus.length ? 'GAP-ANALYSIS FOCUS (prioritize questions that probe these): ' + gapFocus.join(', ') : '',
    '',
    'JOB DESCRIPTION:',
    String(jobDescription || '').slice(0, 6000),
    '',
    'Ground EVERY question in the role above: name its specific technologies,',
    'skills, and gap-focus areas. Technical and system-design questions must be',
    'specific to this stack (not generic). Behavioral and leadership questions',
    'must name a responsibility or situation from THIS job description (not the',
    'generic set every company asks). Generate the full question set as JSON',
    'now (' + counts + ').',
    otherList.length ? '\nQUESTIONS FROM THE CANDIDATE\'S OTHER JOBS (do NOT reuse or lightly rephrase these; this job needs its own set):\n' + otherList.map((x) => '- ' + x).join('\n') : '',
    avoidList.length ? '\nALREADY ASKED (the candidate has these; do NOT repeat or rephrase them. Cover different topics, scenarios and depths of the same job):\n' + avoidList.map((x) => '- ' + x).join('\n') : '',
  ].filter(Boolean).join('\n');
}

function validateQuestions(parsed) {
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'not-object' };
  const raw = Array.isArray(parsed.questions) ? parsed.questions : null;
  if (!raw) return { ok: false, reason: 'no-questions' };

  const clean = [];
  const counts = {};
  for (const q of raw) {
    if (!q || typeof q !== 'object') continue;
    let category = String(q.category || '').toLowerCase().replace(/[\s-]+/g, '_');
    if (VALID_CATEGORIES.indexOf(category) === -1) continue;
    const prompt = typeof q.prompt === 'string' ? q.prompt.trim() : '';
    if (!prompt) continue;
    // A "tell me about a time" story question is behavioral, whatever the
    // model labelled it (a mislabel steers the weakest-area advice wrong).
    if (category === 'technical' && /\b(tell me about a time|(?:give|share|describe|walk me through)\s+(?:me\s+)?(?:an?\s+)?(?:example|time|situation)\b|an example of a time|a time when you)/i.test(prompt)) category = 'behavioral';
    let difficulty = String(q.difficulty || 'medium').toLowerCase();
    if (VALID_DIFFICULTY.indexOf(difficulty) === -1) difficulty = 'medium';
    clean.push({ category, difficulty, prompt: prompt.slice(0, 600) });
    counts[category] = (counts[category] || 0) + 1;
  }

  // Require a meaningful set: at least half the target in each of the 4 buckets.
  const enough = VALID_CATEGORIES.every((c) => (counts[c] || 0) >= Math.ceil(QUESTION_TARGETS[c] / 2));
  if (clean.length < 12 || !enough) return { ok: false, reason: 'insufficient', counts: counts };

  return { ok: true, questions: clean, counts: counts };
}

module.exports = {
  GAP_SYSTEM_PROMPT,
  buildGapUserMessage,
  validateGap,
  QUESTIONS_SYSTEM_PROMPT,
  buildQuestionsUserMessage,
  validateQuestions,
  QUESTION_TARGETS,
  VALID_CATEGORIES,
  ctxList,
};
