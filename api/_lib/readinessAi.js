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
    String(resumeText || '').slice(0, 6000) || sigLines || '(no resume provided)',
    '',
    'Compare and return the gap analysis JSON now.',
  ].join('\n');
}

function clampInt(n, lo, hi) {
  n = Math.round(Number(n));
  if (!isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function strArr(v, max) {
  return Array.isArray(v)
    ? v.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim().slice(0, 160)).slice(0, max || 12)
    : [];
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
      strengths: strArr(parsed.strengths, 12),
      missingSkills: strArr(parsed.missingSkills, 12),
      missingKeywords: strArr(parsed.missingKeywords, 15),
      missingExperience: strArr(parsed.missingExperience, 10),
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 500) : '',
    },
  };
}

// ===========================================================================
// QUESTION GENERATION — JD -> categorized interview questions with difficulty.
// ===========================================================================

// Target counts per category (spec: 10 technical, 10 behavioral, 5 system
// design, 5 leadership).
const QUESTION_TARGETS = {
  technical: 10,
  behavioral: 10,
  system_design: 5,
  leadership: 5,
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
  'Required counts: 10 technical, 10 behavioral, 5 system_design, 5 leadership.',
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
    technologies, coreSkills, missingSkills, missingKeywords, missingExperience, avoid,
  } = input || {};
  const avoidList = Array.isArray(avoid) ? avoid.filter((x) => typeof x === 'string' && x.trim()).slice(0, 60).map((x) => x.trim().slice(0, 160)) : [];

  const techs = ctxList(technologies, 15, 60);
  const skills = ctxList(coreSkills, 15, 80);
  const gapFocus = ctxList(
    [].concat(missingSkills || [], missingKeywords || [], missingExperience || []),
    15, 80
  );

  return [
    'JOB TITLE: ' + String(jobTitle || 'unspecified').slice(0, 200),
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
    'specific to this stack (not generic). Generate the full question set as JSON',
    'now (10 technical, 10 behavioral, 5 system_design, 5 leadership).',
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
    const category = String(q.category || '').toLowerCase().replace(/[\s-]+/g, '_');
    if (VALID_CATEGORIES.indexOf(category) === -1) continue;
    const prompt = typeof q.prompt === 'string' ? q.prompt.trim() : '';
    if (!prompt) continue;
    let difficulty = String(q.difficulty || 'medium').toLowerCase();
    if (VALID_DIFFICULTY.indexOf(difficulty) === -1) difficulty = 'medium';
    clean.push({ category, difficulty, prompt: prompt.slice(0, 600) });
    counts[category] = (counts[category] || 0) + 1;
  }

  // Require a meaningful set: at least half the target in each of the 4 buckets.
  const enough = VALID_CATEGORIES.every((c) => (counts[c] || 0) >= Math.ceil(QUESTION_TARGETS[c] / 2));
  if (clean.length < 15 || !enough) return { ok: false, reason: 'insufficient', counts: counts };

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
