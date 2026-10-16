/**
 * "Who's interviewing you?": likely questions for one kind of interviewer
 * (recruiter, hiring manager, technical peer, senior leader, business
 * partner) for the user's job, with why they ask and how to answer.
 *
 * Works from the interviewer's KIND and the job only. It never looks up a
 * real person. Pure helpers (prompt + parse) for unit tests.
 */

'use strict';

const TYPES = {
  recruiter: 'Recruiter or HR screen. Cares about: motivation for this role and company, career story, why leaving, salary expectations, notice period, location or visa, culture fit, communication. Mostly non-technical.',
  hiring_manager: 'Hiring manager (the future boss). Cares about: can you do this exact job from day one, ownership, how you prioritise, how you work with the team, examples from your past roles, what you would do in the first 90 days, gaps in your resume.',
  peer: 'Technical peer (an engineer or specialist on the team). Cares about: hands-on depth in the job\'s core skills, how you debug, design choices and trade-offs, code or query quality, tools you really used, whether they would want to work with you.',
  leader: 'Senior leader (director, VP or executive). Cares about: business impact and outcomes, strategy and judgement, scale, influencing without authority, leading through change, stakeholder management, how your work moves company goals. Little implementation detail.',
  business: 'Business or product partner (product manager, analyst, operations or a stakeholder from another team). Cares about: translating business needs into solutions, explaining technical things simply, handling conflicting requests, data trust, delivery and communication.',
};
const TYPE_KEYS = Object.keys(TYPES);
const ROLE_MAX = 80;

const SYSTEM = `
You help a candidate prepare for one specific kind of interviewer.
Write the questions THIS kind of interviewer is most likely to ask for THIS job,
in their voice and at their level. A recruiter does not ask deep technical
questions; a technical peer does not ask about salary.

Rules:
- 8 questions, most likely first. Specific to the job title and skills given.
- why: one short line on what the interviewer is really checking.
- tip: one short line on how to answer well (structure, what to include).
- focus: one or two sentences on what this interviewer cares about most.
- No made-up facts about the company or the person.
Return ONLY JSON:
{"focus":"","questions":[{"text":"","why":"","tip":""}]}
`.trim();

const s = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function buildInterviewerMessages(type, role, job) {
  const lines = ['INTERVIEWER: ' + (TYPES[type] || TYPES.hiring_manager)];
  const r = s(role, ROLE_MAX);
  if (r) lines.push('Their title, as the candidate wrote it: ' + r);
  if (job && job.title) lines.push('', 'JOB: ' + s(job.title, 160) + (job.company ? ' at ' + s(job.company, 120) : ''));
  if (job && Array.isArray(job.skills) && job.skills.length) lines.push('Key skills: ' + job.skills.slice(0, 15).map((k) => s(k, 60)).filter(Boolean).join(', '));
  return [{ role: 'system', content: SYSTEM }, { role: 'user', content: lines.join('\n') }];
}

function parseInterviewer(raw) {
  let o = null;
  try { o = JSON.parse(String(raw || '').replace(/^```(?:json)?|```$/g, '').trim()); } catch (_) { return null; }
  if (!o || typeof o !== 'object') return null;
  const seen = new Set();
  const questions = (Array.isArray(o.questions) ? o.questions : [])
    .map((q) => ({ text: s(q && q.text, 300), why: s(q && q.why, 200), tip: s(q && q.tip, 240) }))
    .filter((q) => {
      const k = q.text.toLowerCase();
      if (q.text.length < 10 || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 10);
  if (questions.length < 3) return null;
  return { focus: s(o.focus, 300), questions };
}

module.exports = { TYPES, TYPE_KEYS, ROLE_MAX, buildInterviewerMessages, parseInterviewer };
