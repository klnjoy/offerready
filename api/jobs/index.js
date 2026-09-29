/**
 * /api/jobs  (Vercel serverless function)
 * ---------------------------------------------------------------------------
 * GET  → list the signed-in user's saved jobs (summary fields).
 * POST → save a new analyzed job for the signed-in user.
 *
 * Identity comes from a verified Supabase JWT (Authorization: Bearer). All DB
 * access is scoped to that user id. Never trusts a client-supplied user id.
 *
 * Free-tier limit (spec §17): non-Pro users may keep a limited number of saved
 * jobs. The limit is enforced HERE (server-side), not in the browser. A user
 * with the `interview_pro` entitlement (any Pro feature) is treated as Pro.
 */

'use strict';

const { setCors, send } = require('../_lib/http');
const { getUser } = require('../_lib/supabaseAuth');
const { hasEntitlement } = require('../_lib/entitlements');
const { listJobs, countJobs, insertJob } = require('../_lib/jobs');

// Free users may save this many jobs; Pro is effectively unlimited.
const FREE_JOB_LIMIT = 1;
// Any of these entitlements unlocks "unlimited saved jobs".
const PRO_FEATURES = ['interview_pro', 'architecture_pro', 'system_design_pro'];

function str(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return max ? s.slice(0, max) : s;
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

async function isPro(userId) {
  for (const f of PRO_FEATURES) {
    // eslint-disable-next-line no-await-in-loop
    if (await hasEntitlement(userId, f)) return true;
  }
  return false;
}

module.exports = async function handler(req, res) {
  setCors(res, req.headers && req.headers.origin);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const user = await getUser(req);
  if (!user) { send(res, 401, { error: 'Sign in to use saved jobs.' }); return; }

  if (req.method === 'GET') {
    const jobs = await listJobs(user.id);
    send(res, 200, { ok: true, jobs });
    return;
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
    if (!body || typeof body !== 'object') { send(res, 400, { error: 'Invalid request body.' }); return; }

    const analysis = body.analysis;
    if (!analysis || typeof analysis !== 'object' || !analysis.roleSummary) {
      send(res, 400, { error: 'A valid analysis is required to save a job.' });
      return;
    }

    // Free-tier enforcement (server-side, cannot be bypassed by the client).
    const pro = await isPro(user.id);
    if (!pro) {
      const existing = await countJobs(user.id);
      if (existing >= FREE_JOB_LIMIT) {
        send(res, 403, {
          error: 'Free includes one saved job. Upgrade to Pro to save more.',
          upgrade: true,
          limit: FREE_JOB_LIMIT,
        });
        return;
      }
    }

    const { skillsCount, gapsCount } = summarize(analysis);
    const row = {
      title: str(body.title, 200) || str(body.targetRole, 200) || str(analysis.seniority, 200) || 'Untitled role',
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
