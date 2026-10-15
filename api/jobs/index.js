/**
 * /api/jobs  (Vercel serverless function)
 * ---------------------------------------------------------------------------
 * GET  → list the signed-in user's saved jobs (summary fields).
 * GET ?view=readiness → { scores: { [jobId]: { score, match, practiced, at, week_ago } } }
 * POST → save a new analyzed job for the signed-in user.
 *
 * Identity comes from a verified Supabase JWT (Authorization: Bearer). All DB
 * access is scoped to that user id. Never trusts a client-supplied user id.
 *
 * Free-tier limit (spec §17): non-Pro users may keep a limited number of saved
 * jobs. The limit is enforced HERE (server-side), not in the browser, using
 * api/_lib/plans.js (LIMITS.free.saved_jobs; Pro = unlimited; Pro = any active
 * entitlement from the Stripe Pro bundle). Saved jobs count jobs rows, not
 * usage events. Fails open if storage can't be read.
 */

'use strict';

const { setCors, send } = require('../_lib/http');
const { getUser } = require('../_lib/supabaseAuth');
const { listJobs, insertJob, deriveJobTitle } = require('../_lib/jobs');
const { checkQuota, quotaError } = require('../_lib/plans');
const { readinessByJob } = require('../_lib/readiness');

function str(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return max ? s.slice(0, max) : s;
}

/** An analysis worth saving: an object with a summary or any skills,
 * responsibilities or requirements in it. */
function hasAnalysisContent(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return false;
  if (str(a.roleSummary)) return true;
  const lists = ['coreSkills', 'technologies', 'responsibilities', 'experienceRequirements', 'preferredSkills', 'interviewSignals'];
  return lists.some((k) => Array.isArray(a[k]) && a[k].length > 0);
}

/** A short summary when the analysis has none: the start of the posting,
 * else the job title. */
function fallbackSummary(body, a) {
  const jd = str(body && body.jobDescription);
  if (jd) {
    const flat = jd.replace(/\s+/g, ' ');
    return flat.length > 400 ? flat.slice(0, 400).replace(/\s+\S*$/, '') + '…' : flat;
  }
  return str(a.jobTitle) || str(body && body.title) || 'Saved job';
}

/** Derive dashboard columns from a full analysis object. */
function summarize(analysis) {
  const a = analysis || {};
  const skills = new Set();
  (a.coreSkills || []).forEach((s) => skills.add(typeof s === 'string' ? s : (s && s.name)));
  (a.technologies || []).forEach((t) => skills.add(t));
  const skillsCount = Array.from(skills).filter(Boolean).length;
  const gapsCount = (a.potentialGaps || []).length;
  return { skillsCount, gapsCount };
}

module.exports = async function handler(req, res) {
  setCors(res, req.headers && req.headers.origin);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const user = await getUser(req);
  if (!user) { send(res, 401, { error: 'Sign in to use saved jobs.' }); return; }

  if (req.method === 'GET') {
    // ?view=readiness → readiness for every job, for the Readiness overview.
    const view = (req.query && req.query.view) || (/[?&]view=readiness(&|$)/.test(String(req.url || '')) ? 'readiness' : '');
    if (view === 'readiness') {
      const scores = await readinessByJob(user.id);
      res.setHeader('Cache-Control', 'private, no-store');
      send(res, 200, { ok: true, scores });
      return;
    }
    const jobs = await listJobs(user.id);
    send(res, 200, { ok: true, jobs });
    return;
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
    if (!body || typeof body !== 'object') { send(res, 400, { error: 'Invalid request body.' }); return; }

    const analysis = body.analysis;
    if (!hasAnalysisContent(analysis)) {
      send(res, 400, { error: 'A valid analysis is required to save a job.' });
      return;
    }
    // The model sometimes leaves roleSummary empty while the rest of the
    // analysis is fine: fill it from the posting instead of refusing the job.
    if (!str(analysis.roleSummary)) {
      analysis.roleSummary = fallbackSummary(body, analysis);
    }

    // Free-tier enforcement (server-side, cannot be bypassed by the client).
    const quota = await checkQuota(user.id, 'saved_jobs');
    if (!quota.ok) { send(res, 403, quotaError(quota, 'saved_jobs')); return; }

    const { skillsCount, gapsCount } = summarize(analysis);
    const row = {
      // Derive a meaningful title (priority: explicit -> analysis seniority ->
      // role-summary clause -> 'Untitled role'); never store placeholders like
      // "Not specified". See deriveJobTitle in _lib/jobs.js.
      title: deriveJobTitle(body, analysis),
      company: str(body.company, 200),
      seniority: str(analysis.seniority, 200),
      skills_count: skillsCount,
      gaps_count: gapsCount,
      analysis,
      // Store the JD only if the client explicitly sends it to be saved.
      job_description: str(body.jobDescription, 20000),
      model: str(body.model, 80),
      last_activity_at: new Date().toISOString(),
    };

    const created = await insertJob(user.id, row);
    if (!created) { send(res, 502, { error: 'Could not save this job. Please try again.' }); return; }
    send(res, 201, { ok: true, job: created });
    return;
  }

  send(res, 405, { error: 'Method not allowed.' });
};

module.exports._test = { hasAnalysisContent, fallbackSummary };
