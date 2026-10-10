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
  normalizeRoleFamily, isWeakTitle, repairedTitleFor, deriveTitleFromSignals,
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

// ---------------------------------------------------------------------------
// Role-family normalization (spec §5). Matching uses the COMPLETE context
// (title + summary + skills + technologies), never seniority alone.
// ---------------------------------------------------------------------------

test('normalizeRoleFamily: Senior Data Engineer -> data-engineer (NOT data-architect)', () => {
  assert.equal(normalizeRoleFamily({ title: 'Senior Data Engineer' }), 'data-engineer');
});

test('normalizeRoleFamily: Azure Data Engineer -> data-engineer', () => {
  assert.equal(normalizeRoleFamily({ title: 'Azure Data Engineer', technologies: ['Azure', 'Databricks'] }), 'data-engineer');
});

test('normalizeRoleFamily: Data Platform Engineer / Spark / ETL -> data-engineer', () => {
  assert.equal(normalizeRoleFamily({ title: 'Data Platform Engineer' }), 'data-engineer');
  assert.equal(normalizeRoleFamily({ title: 'Engineer', roleSummary: 'Builds Spark ETL pipelines.' }), 'data-engineer');
  assert.equal(normalizeRoleFamily({ roleSummary: 'Owns real-time streaming and data quality.' }), 'data-engineer');
});

test('normalizeRoleFamily: Data Architect still -> data-architect (not stolen by data-engineer)', () => {
  assert.equal(normalizeRoleFamily({ title: 'Data Architect' }), 'data-architect');
  assert.equal(normalizeRoleFamily({ title: 'Analytics Architect', roleSummary: 'Snowflake warehouse modeling.' }), 'data-architect');
});

// Role-noun tiebreaker: a Snowflake/warehouse ENGINEER is Data Engineering, not
// Data Architecture. Snowflake was historically an architect-only signal, which
// mislabeled a "Snowflake Engineer" as Data Architect.
test('normalizeRoleFamily: Snowflake Data Engineer -> data-engineer (not data-architect)', () => {
  assert.equal(normalizeRoleFamily({ title: 'Snowflake Data Engineer' }), 'data-engineer');
});

test('normalizeRoleFamily: Snowflake Engineer (warehouse role) -> data-engineer', () => {
  assert.equal(
    normalizeRoleFamily({ title: 'Snowflake Engineer', roleSummary: 'Owns the Snowflake data warehouse and analytics layer.' }),
    'data-engineer'
  );
});

test('normalizeRoleFamily: Snowflake ARCHITECT still -> data-architect (engineer tiebreaker does not steal it)', () => {
  assert.equal(normalizeRoleFamily({ title: 'Snowflake Data Architect' }), 'data-architect');
  assert.equal(
    normalizeRoleFamily({ title: 'Data Architect', roleSummary: 'Snowflake warehouse data modeling and dimensional design.' }),
    'data-architect'
  );
});

test('normalizeRoleFamily: AI/GenAI Engineer -> ai-engineer', () => {
  assert.equal(normalizeRoleFamily({ title: 'AI Engineer', roleSummary: 'Builds RAG and LLM agents.' }), 'ai-engineer');
});

// Role-noun tiebreaker: an AI ENGINEER whose JD lists "architecture" as a SKILL
// (e.g. "Multi-Agent / A2A architectures") must NOT be mislabeled AI Architect.
test('normalizeRoleFamily: AI Engineer with "A2A architectures" skill -> ai-engineer (NOT ai-architect)', () => {
  const fam = normalizeRoleFamily({
    title: 'AI Engineer',
    roleSummary: 'Develops agentic AI applications and multi-agent systems with LangChain and LangGraph.',
    skills: ['Agentic AI', 'Multi-Agent / A2A architectures', 'LangChain', 'LangGraph', 'Deep Agents / Agent orchestration', 'LLM-powered applications'],
  });
  assert.equal(fam, 'ai-engineer');
});

test('normalizeRoleFamily: genuine AI Architect still -> ai-architect (engineer tiebreaker does not steal it)', () => {
  assert.equal(
    normalizeRoleFamily({ title: 'AI Architect', roleSummary: 'Owns multi-tenant GenAI platform system design and architecture.' }),
    'ai-architect'
  );
});

test('normalizeRoleFamily: Forward Deployed / Solutions Engineer -> fde', () => {
  assert.equal(normalizeRoleFamily({ title: 'Solutions Engineer', roleSummary: 'Customer-facing delivery.' }), 'fde');
});

test('normalizeRoleFamily: Cloud/Platform/DevOps -> cloud-platform', () => {
  assert.equal(normalizeRoleFamily({ title: 'Platform Engineer', technologies: ['Kubernetes', 'Terraform'] }), 'cloud-platform');
});

test('normalizeRoleFamily: bare seniority maps to NO family', () => {
  assert.equal(normalizeRoleFamily({ title: 'Senior', seniority: 'Senior' }), '');
  assert.equal(normalizeRoleFamily({ seniority: 'Staff' }), '');
  assert.equal(normalizeRoleFamily({}), '');
});

// AI SECURITY is for AI/LLM security roles only. A general data/infra security
// JD (Snowflake RBAC, data masking, CyberArk, audit, compliance) must NOT match
// the bare word "security" and must fall through to the data family.
test('normalizeRoleFamily: Snowflake data-security role -> data (NOT ai-security)', () => {
  const fam = normalizeRoleFamily({
    title: 'Senior',
    roleSummary: 'Establishes a Snowflake Center of Excellence, implementing security '
      + 'frameworks, automating user provisioning, and ensuring compliance with audit findings.',
    technologies: ['Snowflake', 'CyberArk', 'AWS', 'ServiceNow', 'Terraform'],
    skills: ['Snowflake administration', 'Dynamic Data Masking', 'CI/CD pipelines'],
  });
  assert.notEqual(fam, 'ai-security');
  assert.ok(fam === 'data-architect' || fam === 'data-engineer' || fam === 'cloud-platform',
    'a Snowflake data-security role should map to a data/cloud family, got: ' + fam);
});

test('normalizeRoleFamily: generic security without AI signal is not ai-security', () => {
  assert.notEqual(
    normalizeRoleFamily({ title: 'Security Engineer', roleSummary: 'Zero-trust network security and threat monitoring on AWS.' }),
    'ai-security'
  );
});

test('normalizeRoleFamily: genuine AI/LLM security role -> ai-security', () => {
  assert.equal(
    normalizeRoleFamily({ title: 'AI Security Engineer', roleSummary: 'Hardens LLM apps against prompt injection and model threats.' }),
    'ai-security'
  );
  // Strong AI-security phrase alone is enough even without the word "security".
  assert.equal(
    normalizeRoleFamily({ roleSummary: 'Owns guardrails and prompt injection defenses for our GenAI agents.' }),
    'ai-security'
  );
});

// ---------------------------------------------------------------------------
// isWeakTitle / repairedTitleFor (legacy-title repair ON REOPEN only, spec §3).
// ---------------------------------------------------------------------------

test('isWeakTitle: flags empty / junk / bare seniority / company blurb / paragraph', () => {
  assert.equal(isWeakTitle(''), true);
  assert.equal(isWeakTitle('Not specified'), true);
  assert.equal(isWeakTitle('Senior'), true);
  assert.equal(isWeakTitle('Datavations is a data and AI software company'), true);
  assert.equal(isWeakTitle('x'.repeat(90)), true);
});

test('isWeakTitle: accepts a real role title', () => {
  assert.equal(isWeakTitle('Senior Data Engineer'), false);
  assert.equal(isWeakTitle('Azure Data Engineer'), false);
  assert.equal(isWeakTitle('Solutions Architect'), false);
});

test('repairedTitleFor: repairs a weak title from the job analysis', () => {
  const job = {
    title: 'Senior',
    analysis: { seniority: 'Senior', roleSummary: 'Acme hires a Data Engineer for its lakehouse.' },
  };
  assert.equal(repairedTitleFor(job), 'Senior Data Engineer');
});

test('repairedTitleFor: company-blurb title repaired to the real role', () => {
  const job = {
    title: 'Datavations is a data and AI software company',
    analysis: { seniority: 'Not specified', roleSummary: 'Datavations is a data and AI software company hiring a Data Engineer.' },
  };
  assert.ok(/data engineer/i.test(repairedTitleFor(job)));
});

test('repairedTitleFor: preserves a valid/user-edited title (returns "")', () => {
  const job = { title: 'Staff ML Engineer', analysis: { roleSummary: 'whatever' } };
  assert.equal(repairedTitleFor(job), '');
});

test('repairedTitleFor: does not replace one weak guess with another (returns "")', () => {
  const job = { title: 'Senior', analysis: { seniority: 'Senior', roleSummary: 'A great company culture.' } };
  assert.equal(repairedTitleFor(job), '');
});

// ---------------------------------------------------------------------------
// Title from JD-derived signals (Defect 1): a JD with Snowflake/ETL/warehouse/
// analytics clearly describes a role even when roleSummary has no role phrase.
// deriveJobTitle must synthesize a title, not return "Untitled role".
// ---------------------------------------------------------------------------

test('deriveTitleFromSignals: Snowflake + ETL + warehouse -> Snowflake Data Engineer', () => {
  const t = deriveTitleFromSignals(
    { technologies: ['Snowflake', 'SQL', 'Tableau'], coreSkills: ['ETL', 'ELT', 'Data Warehousing', 'Analytics'] },
    ''
  );
  assert.equal(t, 'Snowflake Data Engineer');
});

test('deriveTitleFromSignals: ETL/pipeline signal -> Data Engineer (data-eng wins over analytics)', () => {
  // ETL/pipeline is an engineering signal and is matched before the analytics
  // branch, so a SQL+Analytics+ETL JD is a Data Engineer (correct precedence).
  const t = deriveTitleFromSignals({ technologies: ['SQL'], coreSkills: ['Analytics', 'ETL'] }, '');
  assert.equal(t, 'Data Engineer');
});

test('deriveTitleFromSignals: Tableau + analytics + SQL (no ETL) -> Analytics Engineer', () => {
  const t = deriveTitleFromSignals({ technologies: ['SQL', 'Tableau'], coreSkills: ['Analytics', 'Reporting'] }, '');
  assert.equal(t, 'Analytics Engineer');
});

test('deriveTitleFromSignals: plain SQL + reporting (no analytics engine signal) -> Data Engineer', () => {
  const t = deriveTitleFromSignals({ technologies: ['SQL'], coreSkills: ['Reporting'] }, '');
  assert.equal(t, 'Data Engineer');
});

test('deriveTitleFromSignals: RAG/LLM -> AI Engineer', () => {
  const t = deriveTitleFromSignals({ technologies: ['RAG', 'LLM', 'Vector DB'] }, '');
  assert.equal(t, 'AI Engineer');
});

test('deriveTitleFromSignals: level prefix is applied', () => {
  const t = deriveTitleFromSignals({ technologies: ['Databricks', 'Spark'] }, 'Senior');
  assert.equal(t, 'Senior Databricks Data Engineer');
});

test('deriveTitleFromSignals: no usable signal -> ""', () => {
  assert.equal(deriveTitleFromSignals({}, ''), '');
  assert.equal(deriveTitleFromSignals({ coreSkills: ['Communication', 'Teamwork'] }, ''), '');
});

test('deriveJobTitle: JD-signal fallback prevents "Untitled role" for a clear data JD', () => {
  // No explicit title, junk seniority, roleSummary with no role phrase, but the
  // technologies/skills clearly describe a Snowflake data role.
  const t = deriveJobTitle(
    {},
    {
      seniority: 'Not specified',
      roleSummary: 'A fast-growing team that values ownership and curiosity.',
      technologies: ['Snowflake', 'SQL', 'Tableau'],
      coreSkills: ['ETL', 'ELT', 'Data Warehousing', 'Analytics'],
    }
  );
  assert.notEqual(t, 'Untitled role');
  assert.equal(t, 'Snowflake Data Engineer');
});

test('deriveJobTitle: still "Untitled role" when truly no role signal exists', () => {
  const t = deriveJobTitle(
    {},
    { seniority: 'Not specified', roleSummary: 'A great culture.', coreSkills: ['Teamwork'] }
  );
  assert.equal(t, 'Untitled role');
});

// ---------------------------------------------------------------------------
// Defect 1: role extraction must NOT stop at a seniority word. The seniority is
// a qualifier that is retained together with the role noun; a bare level
// ("Senior"/"Lead"/"Principal") is never a title on its own.
// ---------------------------------------------------------------------------

test('extractRoleFromSummary: keeps seniority + platform + role noun together', () => {
  assert.equal(
    extractRoleFromSummary('We want a Senior Databricks Data Engineer for the lakehouse.'),
    'Senior Databricks Data Engineer'
  );
  assert.equal(
    extractRoleFromSummary('Hiring a Lead GenAI Engineer to own our agents.'),
    'Lead GenAI Engineer'
  );
  assert.equal(
    extractRoleFromSummary('Seeking a Principal Data Architect for governance.'),
    'Principal Data Architect'
  );
});

test('deriveJobTitle: explicit "Senior Databricks Data Engineer" is kept whole', () => {
  assert.equal(
    deriveJobTitle({ targetRole: 'Senior Databricks Data Engineer' }, { seniority: 'Senior' }),
    'Senior Databricks Data Engineer'
  );
});

test('deriveJobTitle: bare seniority + role in summary => full role (never "Senior")', () => {
  const t = deriveJobTitle(
    {},
    { seniority: 'Senior', roleSummary: 'We want a Databricks Data Engineer for the lakehouse.' }
  );
  assert.equal(t, 'Senior Databricks Data Engineer');
  assert.notEqual(t.toLowerCase(), 'senior');
});

test('deriveJobTitle: bare seniority is NEVER the whole title', () => {
  ['Senior', 'Lead', 'Principal', 'Staff', 'Junior'].forEach(function (lvl) {
    const t = deriveJobTitle({ targetRole: lvl }, { seniority: lvl });
    assert.notEqual(t.toLowerCase(), lvl.toLowerCase(),
      lvl + ' alone must not be persisted as a title');
  });
});

// ---- 2026-10: exact posting title + no guessed level -----------------------
const { deriveJobTitle: dj } = require('../_lib/jobs');

test('the posting\'s own title (analysis.jobTitle) wins over summary heuristics', () => {
  assert.equal(dj({}, { jobTitle: 'AI Strategy Lead', seniority: 'Senior', roleSummary: 'The Data Engineer builds pipelines.' }), 'AI Strategy Lead');
  assert.equal(dj({ targetRole: 'Staff ML Engineer' }, { jobTitle: 'ML Engineer' }), 'Staff ML Engineer');
});

test('a level the job description never states is not added to the title', () => {
  const a = { seniority: 'Senior', roleSummary: 'The Data Engineer will build pipelines.' };
  assert.equal(dj({ jobDescription: 'We need a Data Engineer to build pipelines.' }, a), 'Data Engineer');
  assert.equal(dj({ jobDescription: 'We need a Senior Data Engineer to build pipelines.' }, a), 'Senior Data Engineer');
});

test('a bare level as jobTitle is ignored', () => {
  assert.notEqual(dj({}, { jobTitle: 'Senior', roleSummary: 'The Data Engineer will build pipelines.' }), 'Senior');
});
