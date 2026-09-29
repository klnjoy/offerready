/**
 * /api/jobs/:id  (Vercel serverless function)
 * ---------------------------------------------------------------------------
 * GET    → return one full saved job (including the analysis) for the owner.
 * DELETE → delete one saved job owned by the signed-in user.
 *
 * Identity from a verified Supabase JWT; all access scoped to that user id.
 * A job that isn't found OR isn't owned by the caller returns 404 (no leak of
 * whether the id exists for someone else).
 */

'use strict';

const { setCors, send } = require('../_lib/http');
const { getUser } = require('../_lib/supabaseAuth');
const { getJob, deleteJob } = require('../_lib/jobs');

module.exports = async function handler(req, res) {
  setCors(res, req.headers && req.headers.origin);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const id = (req.query && (req.query.id || req.query['[id]']))
    || (req.url || '').split('/').pop().split('?')[0];
  if (!id) { send(res, 400, { error: 'Missing job id.' }); return; }

  const user = await getUser(req);
  if (!user) { send(res, 401, { error: 'Sign in to open this job.' }); return; }

  if (req.method === 'GET') {
    const job = await getJob(user.id, id);
    if (!job) { send(res, 404, { error: 'Job not found.' }); return; }
    send(res, 200, { ok: true, job });
    return;
  }

  if (req.method === 'DELETE') {
    // Confirm ownership first so a non-owner gets 404, not a silent success.
    const job = await getJob(user.id, id);
    if (!job) { send(res, 404, { error: 'Job not found.' }); return; }
    const ok = await deleteJob(user.id, id);
    if (!ok) { send(res, 502, { error: 'Could not delete this job. Please try again.' }); return; }
    send(res, 200, { ok: true, deleted: id });
    return;
  }

  send(res, 405, { error: 'Method not allowed.' });
};
