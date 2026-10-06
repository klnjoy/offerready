/**
 * Tests for deriveJobTitle / cleanTitle (api/_lib/jobs.js).
 * Uses Node's built-in test runner (node --test) — no external dependencies.
 *
 * These lock in the Save Job -> Check My Fit title fix: a saved job must get a
 * meaningful title following the spec priority (explicit -> analysis seniority
 * -> role-summary clause -> 'Untitled role') and must NEVER be stored as a
 * placeholder like "Not specified".
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  deriveJobTitle, cleanTitle, restoreJobContext, GAP_MIN_JD, extractRoleFromSummary,
} = require('../_lib/jobs');

test('cleanTitle: trims and keeps a real title', () => {
  assert.equal(cleanTitle('  Senior AI Engineer  '), 'Senior AI Engineer');
});

test('cleanTitle: treats placeholders/junk as empty (case-insensitive)', () => {
  ['', '   ', 'Not specified', 'NOT SPECIFIED', 'unspecified', 'N/A', 'na',
    'none', 'Unknown', 'Untitled'].forEach(function (v) {
    assert.equal(cleanTitle(v), '', 'expected junk -> "" for: ' + JSON.stringify(v));
  });
});

test('deriveJobTitle (a): explicit body.title wins over everything', () => {
  const t = deriveJobTitle(
    { title: 'Staff ML Engineer', targetRole: 'ML Eng' },
    { seniority: 'Senior', roleSummary: 'Builds platforms.' }
  );
  assert.equal(t, 'Staff ML Engineer');
});

test('deriveJobTitle (a): body.targetRole used when title absent', () => {
  const t = deriveJobTitle(
    { targetRole: 'Snowflake Data Architect' },
    { seniority: 'Senior', roleSummary: 'Owns the warehouse.' }
  );
  assert.equal(t, 'Snowflake Data Architect');
});

test('deriveJobTitle (b): falls back to analysis.seniority when it is real', () => {
  const t = deriveJobTitle({}, { seniority: 'Principal Engineer', roleSummary: 'Leads design.' });
  assert.equal(t, 'Principal Engineer');
});

test('deriveJobTitle (c): skips "Not specified" seniority -> role extracted from summary', () => {
  const t = deriveJobTitle(
    {},
    { seniority: 'Not specified', roleSummary: 'Senior AI Engineer who builds RAG systems on AWS Bedrock.' }
  );
  // Extracts the role phrase (qualifiers + role noun), not the whole clause.
  assert.equal(t, 'Senior AI Engineer');
});

test('deriveJobTitle (c): role-summary clause is cut at the first boundary', () => {
  const t = deriveJobTitle(
    { title: 'Not specified' },
    { seniority: 'unspecified', roleSummary: 'Data Platform Lead — owns ETL and BI pipelines.' }
  );
  assert.equal(t, 'Data Platform Lead');
});

test('deriveJobTitle (d): all-junk input falls back to "Untitled role"', () => {
  const t = deriveJobTitle(
    { title: 'Not specified', targetRole: 'n/a' },
    { seniority: 'unknown', roleSummary: 'none' }
  );
  assert.equal(t, 'Untitled role');
});

test('deriveJobTitle: never returns the placeholder "Not specified"', () => {
  const cases = [
    [{ title: 'Not specified' }, { seniority: 'Not specified', roleSummary: 'Not specified' }],
    [{}, { seniority: 'Not specified' }],
    [{ targetRole: 'Not specified' }, {}],
    [{}, {}],
    [null, null],
  ];
  cases.forEach(function (c) {
    const t = deriveJobTitle(c[0], c[1]);
    assert.notEqual((t || '').toLowerCase(), 'not specified');
    assert.ok(t && t.length > 0, 'title should be non-empty');
  });
});

test('deriveJobTitle: title is capped (never an unbounded paragraph)', () => {
  const long = 'A'.repeat(500);
  const t = deriveJobTitle({ title: long }, {});
  assert.ok(t.length <= 200, 'explicit title capped to 200');
});

// ---------------------------------------------------------------------------
// restoreJobContext — what a saved job restores into the Check My Fit (Gap
// Analysis) form. This is the server-testable mirror of the gap.js prefill +
// job-description hydration. Covers the Save Job -> Check My Fit restore bug
// where Target Role filled but Job Description stayed empty.
// ---------------------------------------------------------------------------

// A realistic FULL job row (as returned by GET /api/jobs/:id, which includes
// job_description + analysis — unlike the light list rows from GET /api/jobs).
function fullJob(overrides) {
  return Object.assign({
    id: 'job-1',
    title: 'Senior Snowflake Architect',
    job_description: 'We are hiring a Senior Snowflake Architect to design and own our cloud data warehouse, ETL/ELT pipelines, and BI layer across the org.',
    analysis: { roleSummary: 'Owns the Snowflake platform and BI.', seniority: 'Senior' },
  }, overrides || {});
}

test('restoreJobContext: saved job restores the job description', () => {
  const ctx = restoreJobContext(fullJob());
  assert.equal(ctx.jd, fullJob().job_description);
  assert.ok(ctx.jd.length >= GAP_MIN_JD);
});

test('restoreJobContext: saved job restores the title (into role)', () => {
  const ctx = restoreJobContext(fullJob());
  assert.equal(ctx.title, 'Senior Snowflake Architect');
  assert.equal(ctx.role, 'Senior Snowflake Architect');
});

test('restoreJobContext: selected job auto-populates the gap form (role + jd)', () => {
  const ctx = restoreJobContext(fullJob());
  assert.ok(ctx.role, 'Target Role is populated');
  assert.ok(ctx.jd, 'Job Description is populated');
});

test('restoreJobContext: analyze gap can run from saved job (only resume needed)', () => {
  const ctx = restoreJobContext(fullJob());
  assert.equal(ctx.canAnalyze, true,
    'with a saved JD present, the user should only need to add a resume');
});

test('restoreJobContext: falls back to analysis.roleSummary when no job_description', () => {
  const ctx = restoreJobContext(fullJob({
    job_description: '',
    analysis: { roleSummary: 'A'.repeat(40) },
  }));
  assert.equal(ctx.jd, 'A'.repeat(40));
  assert.equal(ctx.canAnalyze, true);
});

test('restoreJobContext: validation blocks only when no saved description exists', () => {
  // No JD and no usable role summary -> cannot analyze from saved context,
  // so the "paste a fuller job description" validation legitimately applies.
  const empty = restoreJobContext(fullJob({ job_description: '', analysis: {} }));
  assert.equal(empty.jd, '');
  assert.equal(empty.canAnalyze, false);

  // Too-short saved JD is also not enough on its own.
  const tooShort = restoreJobContext(fullJob({ job_description: 'short', analysis: {} }));
  assert.equal(tooShort.canAnalyze, false);

  // A real saved JD does NOT trigger validation.
  const ok = restoreJobContext(fullJob());
  assert.equal(ok.canAnalyze, true);
});

test('restoreJobContext: Save Job -> Check My Fit restores the SAME job context', () => {
  // Simulate the handoff: a job saved via /api/jobs with a derived title, then
  // reopened in Check My Fit. The restored context must match what was saved.
  const savedTitle = deriveJobTitle(
    { title: '', targetRole: 'Staff Data Engineer' },
    { seniority: 'Not specified', roleSummary: 'Builds pipelines.' }
  );
  const jd = 'Staff Data Engineer owning batch + streaming pipelines, data quality, and the semantic layer for analytics.';
  const saved = fullJob({ title: savedTitle, job_description: jd, analysis: { roleSummary: 'Builds pipelines.' } });

  const ctx = restoreJobContext(saved);
  assert.equal(ctx.title, 'Staff Data Engineer');   // title survives the round-trip
  assert.equal(ctx.role, 'Staff Data Engineer');
  assert.equal(ctx.jd, jd);                          // JD restored verbatim
  assert.equal(ctx.canAnalyze, true);                // only the resume is still needed
});

test('restoreJobContext: null/garbage job does not throw and blocks analyze', () => {
  const a = restoreJobContext(null);
  assert.equal(a.jd, '');
  assert.equal(a.canAnalyze, false);
  const b = restoreJobContext({});
  assert.equal(b.jd, '');
  assert.equal(b.canAnalyze, false);
});

// ---------------------------------------------------------------------------
// Question Generator (Interview Questions page) saved-job restoration.
// questions.js reuses the SAME restoreJobContext contract + 30-char JD
// threshold as Check My Fit, and the server validates generate_questions with
// LIMITS.JD_MIN = 30 (api/_lib/validate.js). These tests lock in that the
// Question Generator restores job context and gates generation identically,
// so a saved job no longer opens with an empty Job Description.
// ---------------------------------------------------------------------------

const { LIMITS } = require('../_lib/validate');

function savedJobForQuestions(overrides) {
  return Object.assign({
    id: 'job-q1',
    title: 'Lead Platform Engineer',
    job_description: 'Lead Platform Engineer owning our Kubernetes platform, CI/CD, observability, and developer experience across multiple product teams.',
    analysis: { roleSummary: 'Owns the internal platform.', seniority: 'Lead' },
  }, overrides || {});
}

test('questions: the client JD threshold matches the server JD_MIN (30)', () => {
  // The gap/questions forms guard on jd.length < 30; the server rejects JDs
  // shorter than LIMITS.JD_MIN. If these drift, a restored job could pass the
  // client yet fail the server (or vice-versa). Keep them equal.
  assert.equal(GAP_MIN_JD, LIMITS.JD_MIN);
  assert.equal(GAP_MIN_JD, 30);
});

test('questions: saved job restores the job description', () => {
  const ctx = restoreJobContext(savedJobForQuestions());
  assert.equal(ctx.jd, savedJobForQuestions().job_description);
});

test('questions: saved job restores the title', () => {
  const ctx = restoreJobContext(savedJobForQuestions());
  assert.equal(ctx.title, 'Lead Platform Engineer');
  assert.equal(ctx.role, 'Lead Platform Engineer');
});

test('questions: generation succeeds with a saved job (JD passes server JD_MIN)', () => {
  const ctx = restoreJobContext(savedJobForQuestions());
  assert.equal(ctx.canAnalyze, true);
  // The restored JD is what the client sends as jobDescription; it must clear
  // the server minimum so "Prepare Practice Questions" actually generates.
  assert.ok(ctx.jd.length >= LIMITS.JD_MIN);
});

test('questions: validation appears only when no saved description exists', () => {
  const none = restoreJobContext(savedJobForQuestions({ job_description: '', analysis: {} }));
  assert.equal(none.canAnalyze, false); // "Please paste a fuller job description" is legitimate

  const restored = restoreJobContext(savedJobForQuestions());
  assert.equal(restored.canAnalyze, true); // real saved JD -> no validation
});

test('questions: active job restoration works on refresh (full job rehydrates context)', () => {
  // On refresh, loadJobsThen preselects the active job id, then restoreOrForm
  // fetches the FULL job (GET /api/jobs/:id) and rehydrates role + JD. Simulate
  // that full-job payload restoring the generate-ready context.
  const full = savedJobForQuestions();
  const ctx = restoreJobContext(full);
  assert.equal(ctx.role, full.title);
  assert.equal(ctx.jd, full.job_description);
  assert.equal(ctx.canAnalyze, true);
});

// ---------------------------------------------------------------------------
// Defend Your Decisions (scenario.js) role identity.
// The Analyze page now derives the "defend role" via the SAME priority as the
// server's deriveJobTitle (explicit targetRole -> real seniority -> roleSummary
// clause), and both the Analyze and Defend pages reject junk placeholders so
// the matched role is NEVER shown as "Not specified". These tests lock in that
// contract against deriveJobTitle (the authoritative, exported implementation
// the client mirrors).
// ---------------------------------------------------------------------------

test('defend role: explicit target role is used (Azure Data Engineer)', () => {
  const r = deriveJobTitle({ targetRole: 'Azure Data Engineer' }, { seniority: 'Not specified' });
  assert.equal(r, 'Azure Data Engineer');
});

test('defend role: real seniority is used when no target role (Data Engineer)', () => {
  const r = deriveJobTitle({}, { seniority: 'Data Engineer', roleSummary: 'Builds pipelines.' });
  assert.equal(r, 'Data Engineer');
});

test('defend role: role extracted from summary when seniority is "Not specified" (Databricks Engineer)', () => {
  const r = deriveJobTitle(
    {},
    { seniority: 'Not specified', roleSummary: 'Databricks Engineer building lakehouse ETL on Azure.' }
  );
  assert.equal(r, 'Databricks Engineer');
});

test('defend role: never resolves to the "Not specified" placeholder', () => {
  const cases = [
    [{ targetRole: '' }, { seniority: 'Not specified' }],
    [{ targetRole: 'Not specified' }, { seniority: 'unspecified' }],
    [{}, { seniority: 'Not specified', roleSummary: '' }],
    [{}, {}],
  ];
  cases.forEach(function (c) {
    const r = deriveJobTitle(c[0], c[1]);
    assert.notEqual((r || '').toLowerCase(), 'not specified');
    assert.ok(r && r.length > 0);
  });
});

test('defend role: saved-job title (deriveJobTitle) survives Analyze -> Save -> Check My Fit', () => {
  // The saved job's title is the authoritative role identity the Defend page
  // upgrades to. It must be a real role even when the user typed nothing and
  // the model could not determine seniority.
  const title = deriveJobTitle(
    { title: '', targetRole: '' },
    { seniority: 'Not specified', roleSummary: 'Senior Azure Data Engineer, Synapse + Databricks.' }
  );
  const ctx = restoreJobContext({ title: title, job_description: 'x'.repeat(40), analysis: {} });
  assert.notEqual(title.toLowerCase(), 'not specified');
  assert.equal(ctx.role, title); // Defend reads this role identity from the saved job
});

// ---------------------------------------------------------------------------
// extractRoleFromSummary / deriveJobTitle company-blurb guard (Bug 3).
// The analysis.roleSummary is a paragraph that often OPENS with a company
// description. The old first-clause split produced titles like
// "Datavations is a data and AI software company...". These lock in that a
// real role phrase is extracted and company prose is skipped.
// ---------------------------------------------------------------------------

test('extractRoleFromSummary: skips company blurb, finds the role phrase', () => {
  const s = 'Datavations is a data and AI software company seeking an Azure Data Engineer '
    + 'to build Databricks pipelines.';
  assert.equal(extractRoleFromSummary(s), 'Azure Data Engineer');
});

test('extractRoleFromSummary: plain role sentence', () => {
  assert.equal(
    extractRoleFromSummary('Senior Databricks Engineer owning the lakehouse.'),
    'Senior Databricks Engineer'
  );
});

test('extractRoleFromSummary: returns "" when there is no role noun', () => {
  assert.equal(extractRoleFromSummary('We value curiosity and ownership.'), '');
  assert.equal(extractRoleFromSummary(''), '');
  assert.equal(extractRoleFromSummary(null), '');
});

test('deriveJobTitle: company-first roleSummary yields a role, not the company blurb', () => {
  const title = deriveJobTitle(
    {},
    {
      seniority: 'Not specified',
      roleSummary: 'Datavations is a data and AI software company. The Azure Data Engineer '
        + 'will build and operate Databricks ETL across the business.',
    }
  );
  assert.equal(title, 'Azure Data Engineer');
  assert.ok(!/company/i.test(title));
  assert.ok(!/datavations/i.test(title));
});

test('deriveJobTitle: explicit targetRole still wins over summary extraction', () => {
  const title = deriveJobTitle(
    { targetRole: 'Data Engineer' },
    { roleSummary: 'Acme is a startup. Looking for a Databricks Architect.' }
  );
  assert.equal(title, 'Data Engineer');
});

test('deriveJobTitle: no role noun anywhere falls back to "Untitled role" (never a blurb)', () => {
  const title = deriveJobTitle(
    {},
    { seniority: 'Not specified', roleSummary: 'A fast-growing company with a great culture.' }
  );
  assert.equal(title, 'Untitled role');
});

// ---------------------------------------------------------------------------
// Bare-seniority regression: a seniority of just "Senior" must NOT become the
// whole title. The role noun from roleSummary must be kept, and the level
// prefixed -> "Senior Data Engineer" (not "Senior").
// ---------------------------------------------------------------------------

test('deriveJobTitle: bare seniority "Senior" is NOT a title; role noun is kept', () => {
  const t = deriveJobTitle(
    {},
    { seniority: 'Senior', roleSummary: 'The Data Engineer builds and operates ETL pipelines.' }
  );
  assert.equal(t, 'Senior Data Engineer');
});

test('deriveJobTitle: bare seniority prepended to extracted role (Azure Data Engineer)', () => {
  const t = deriveJobTitle(
    {},
    { seniority: 'Senior', roleSummary: 'Acme seeks an Azure Data Engineer for its data team.' }
  );
  assert.equal(t, 'Senior Azure Data Engineer');
});

test('deriveJobTitle: seniority already containing a role noun is used as-is', () => {
  const t = deriveJobTitle({}, { seniority: 'Senior Data Engineer', roleSummary: 'whatever' });
  assert.equal(t, 'Senior Data Engineer');
});

test('deriveJobTitle: no double-level when extracted role already has the level', () => {
  const t = deriveJobTitle(
    {},
    { seniority: 'Senior', roleSummary: 'We want a Senior Data Engineer.' }
  );
  assert.equal(t, 'Senior Data Engineer');
});

test('deriveJobTitle: bare seniority + no role noun anywhere -> "Untitled role" (never "Senior")', () => {
  const t = deriveJobTitle({}, { seniority: 'Senior', roleSummary: 'A great culture and strong team.' });
  assert.notEqual(t.toLowerCase(), 'senior');
  assert.equal(t, 'Untitled role');
});

test('deriveJobTitle: Data Engineer role noun survives (never collapses to "Senior")', () => {
  const t = deriveJobTitle(
    {},
    { seniority: 'Senior', roleSummary: 'Datavations is a data and AI software company hiring a Data Engineer.' }
  );
  assert.ok(/data engineer/i.test(t));
  assert.notEqual(t.toLowerCase(), 'senior');
});
