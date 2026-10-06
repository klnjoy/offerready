/**
 * Tests that generated-question CONTEXT is built from the full job (JD + gap +
 * skills + technologies), and that role-specific context materially differs
 * across roles (Defect 2). We test the deterministic prompt builder, not the
 * LLM output: buildQuestionsUserMessage must inject the role's technologies,
 * core skills, and gap focus so a Data Engineer prompt differs from an AI
 * Engineer / Data Architect prompt. Uses node --test (no external deps).
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { buildQuestionsUserMessage, ctxList } = require('../_lib/readinessAi');

const DATA_ENGINEER = {
  jobTitle: 'Senior Data Engineer',
  seniority: 'Senior',
  jobDescription: 'Build and operate batch + streaming data pipelines on a lakehouse.',
  technologies: ['Databricks', 'Spark', 'Snowflake', 'Airflow'],
  coreSkills: ['ETL', 'ELT', 'Data Warehousing', 'SQL'],
  missingSkills: ['dbt', 'Delta Lake'],
  missingKeywords: ['CDC'],
  missingExperience: ['real-time streaming at scale'],
};

const AI_ENGINEER = {
  jobTitle: 'AI Engineer',
  seniority: 'Mid',
  jobDescription: 'Build RAG systems and LLM agents for enterprise search.',
  technologies: ['LangChain', 'Pinecone', 'OpenAI', 'Bedrock'],
  coreSkills: ['RAG', 'Prompt Engineering', 'Vector Search'],
  missingSkills: ['evaluation harnesses', 'guardrails'],
  missingKeywords: ['hallucination'],
  missingExperience: ['production LLM observability'],
};

const DATA_ARCHITECT = {
  jobTitle: 'Data Architect',
  seniority: 'Principal',
  jobDescription: 'Design a governed analytics platform and semantic layer.',
  technologies: ['Snowflake', 'Cortex', 'dbt'],
  coreSkills: ['Dimensional Modeling', 'Data Governance', 'RBAC'],
  missingSkills: ['row-access policies'],
  missingKeywords: ['masking'],
  missingExperience: ['multi-tenant isolation'],
};

test('ctxList: de-dupes, trims, and caps', () => {
  const out = ctxList(['Spark', 'spark', 'Databricks', ''], 10, 80);
  assert.deepEqual(out, ['Spark', 'Databricks']); // case-insensitive de-dupe, drops empty
  assert.ok(ctxList(['a', 'b', 'c', 'd'], 2, 80).length === 2); // cap honored
});

test('ctxList: extracts names from object items', () => {
  const out = ctxList([{ name: 'ETL' }, { requirement: 'CDC' }, { title: 'SQL' }], 10, 80);
  assert.deepEqual(out, ['ETL', 'CDC', 'SQL']);
});

test('buildQuestionsUserMessage: injects technologies, core skills, and gap focus', () => {
  const msg = buildQuestionsUserMessage(DATA_ENGINEER);
  assert.match(msg, /REQUIRED TECHNOLOGIES: .*Databricks/);
  assert.match(msg, /CORE SKILLS: .*ETL/);
  assert.match(msg, /GAP-ANALYSIS FOCUS .*: .*dbt/);
  // gap focus merges missing skills + keywords + experience
  assert.ok(msg.includes('CDC'));
  assert.ok(msg.includes('real-time streaming at scale'));
  // JD still present
  assert.ok(msg.includes('batch + streaming data pipelines'));
});

test('buildQuestionsUserMessage: Data Engineer context materially differs from AI Engineer', () => {
  const de = buildQuestionsUserMessage(DATA_ENGINEER);
  const ai = buildQuestionsUserMessage(AI_ENGINEER);
  assert.notEqual(de, ai);
  // DE-specific tokens appear in DE but not AI
  assert.ok(de.includes('Databricks') && !ai.includes('Databricks'));
  assert.ok(de.includes('ETL') && !ai.includes('ETL'));
  // AI-specific tokens appear in AI but not DE
  assert.ok(ai.includes('RAG') && !de.includes('RAG'));
  assert.ok(ai.includes('LangChain') && !de.includes('LangChain'));
});

test('buildQuestionsUserMessage: Data Engineer differs from Data Architect', () => {
  const de = buildQuestionsUserMessage(DATA_ENGINEER);
  const da = buildQuestionsUserMessage(DATA_ARCHITECT);
  assert.notEqual(de, da);
  assert.ok(de.includes('Spark') && !da.includes('Spark'));
  assert.ok(da.includes('Dimensional Modeling') && !de.includes('Dimensional Modeling'));
  assert.ok(da.includes('Data Governance') && !de.includes('Data Governance'));
});

test('buildQuestionsUserMessage: all three roles produce distinct prompts', () => {
  const prompts = [DATA_ENGINEER, AI_ENGINEER, DATA_ARCHITECT].map(buildQuestionsUserMessage);
  const unique = new Set(prompts);
  assert.equal(unique.size, 3); // every role prompt is distinct
});

test('buildQuestionsUserMessage: still works with only a JD (no analysis signals)', () => {
  const msg = buildQuestionsUserMessage({
    jobTitle: 'Engineer',
    jobDescription: 'A generic job description that is long enough to analyze and generate from.',
  });
  // No context lines when signals are absent, but the JD + instruction remain.
  assert.ok(!/REQUIRED TECHNOLOGIES:/.test(msg));
  assert.ok(!/GAP-ANALYSIS FOCUS/.test(msg));
  assert.ok(msg.includes('generic job description'));
  assert.ok(/10 technical, 10 behavioral, 5 system_design, 5 leadership/.test(msg));
});
