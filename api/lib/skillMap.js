/**
 * skillMap.js — lightweight mapping from a job skill/keyword to an EXISTING
 * OfferReady page. No new content is created here; these are real pages already
 * published on the site. Paths are site-relative (the frontend prepends the
 * site base, e.g. https://klnjoy.github.io/offerready/).
 *
 * If a skill has no matching resource, the lookup returns null and the caller
 * should surface "No matching OfferReady resource found."
 *
 * Keep this list conservative and accurate — do NOT invent URLs.
 */

'use strict';

// Each entry: { match: [keywords, lowercased], label, path }
// NOTE: lookupResource() returns the FIRST entry whose keyword is a substring
// of the query, so MORE-SPECIFIC / enterprise terms are listed first so they
// win over generic ones (e.g. "policy-as-code" before "devops", "hipaa"/"owasp"
// before "security"). These map enterprise AI-architect JD terms to EXISTING
// OfferReady pages — no new pages are created here.
const RESOURCES = [
  // ---- Enterprise / DevSecOps / compliance (specific → listed first) --------
  { match: ['devsecops', 'sast', 'sca', 'software composition', 'container scanning',
            'secrets management', 'policy-as-code', 'policy as code', 'supply chain',
            'sbom', 'iac governance', 'infrastructure-as-code', 'ci/cd security',
            'quality gate', 'security scanning'],
    label: 'DevOps for AI (secure SDLC / DevSecOps)', path: 'GenAI-Topics/devops-ai/index.html' },
  { match: ['hipaa', 'phi', 'pii', 'gdpr', 'compliance', 'soc2', 'audit', 'lineage',
            'governance', 'explainability', 'bias', 'data governance'],
    label: 'Enterprise Compliance & Governance', path: 'Enterprise/compliance/index.html' },
  { match: ['owasp', 'zero trust', 'zero-trust', 'threat model', 'secure-by-design',
            'secure by design', 'security architecture'],
    label: 'Enterprise Security Architecture', path: 'Enterprise/security-architecture/index.html' },
  { match: ['enterprise architecture', 'reference architecture', 'ddd',
            'domain-driven', 'domain driven', 'clean architecture', 'microservices',
            'cloud-native', 'cloud native', 'solution architect', 'ai architect'],
    label: 'Enterprise Reference Architectures', path: 'Enterprise/reference-architectures/index.html' },
  // ---- AI-assisted engineering & agentic SDLC ------------------------------
  { match: ['copilot', 'claude code', 'codex', 'ai coding', 'coding assistant',
            'ai-assisted', 'ai assisted', 'code modernization', 'code generation',
            'pull request review', 'pr review', 'multi-agent', 'agent ecosystem',
            'agentic'],
    label: 'Agent Engineering (agentic SDLC)', path: 'GenAI-Topics/agent-engineering/index.html' },
  // ---- ML foundations (TensorFlow/PyTorch/MLOps/NLP/CV/DL) ------------------
  { match: ['tensorflow', 'pytorch', 'scikit', 'mlops', 'deep learning', 'nlp',
            'computer vision', 'model lifecycle', 'model training', 'ml pipeline',
            'supervised', 'unsupervised', 'fine-tune', 'fine tuning'],
    label: 'LLM & ML Fundamentals', path: 'GenAI-Topics/llm-fundamentals/index.html' },
  // ---- Data & AI platform (newer product names) ----------------------------
  { match: ['databricks', 'lakehouse', 'delta lake', 'genie', 'spark', 'unity catalog'],
    label: 'Databricks (Lakehouse / Genie / Delta)', path: 'Technologies/databricks/index.html' },
  { match: ['cortex', 'coco', 'cortex analyst', 'cortex search', 'semantic model'],
    label: 'Snowflake Cortex', path: 'Snowflake-Cortex/index.html' },
  // ---- Cloud platforms (Azure / GCP / AWS architect) -----------------------
  { match: ['azure', 'gcp', 'google cloud', 'vertex', 'distributed systems',
            'scalable systems', 'scalability'],
    label: 'Reliability & Distributed Systems', path: 'GenAI-Topics/reliability/index.html' },

  { match: ['rag', 'retrieval augmented', 'retrieval-augmented'],
    label: 'RAG', path: 'GenAI-Topics/rag/index.html' },
  { match: ['retrieval tuning', 'reranking', 'hybrid search', 'top-k'],
    label: 'Retrieval Tuning', path: 'GenAI-Topics/retrieval-tuning/index.html' },
  { match: ['bedrock', 'amazon bedrock', 'aws bedrock'],
    label: 'Amazon Bedrock', path: 'GenAI-Topics/bedrock/index.html' },
  { match: ['agent', 'agents', 'agentic', 'tool calling', 'tool use'],
    label: 'Building Agents — Deep Dive', path: 'GenAI-Topics/agent-principles/index.html' },
  { match: ['agent engineering', 'multi-agent', 'orchestration'],
    label: 'Agent Engineering', path: 'GenAI-Topics/agent-engineering/index.html' },
  { match: ['mcp', 'model context protocol'],
    label: 'MCP', path: 'GenAI-Topics/mcp/index.html' },
  { match: ['langchain', 'langgraph'],
    label: 'LangChain / LangGraph', path: 'GenAI-Topics/langchain/index.html' },
  { match: ['vector db', 'vector database', 'embeddings', 'pinecone', 'faiss'],
    label: 'Vector DB', path: 'GenAI-Topics/vector-db/index.html' },
  { match: ['llm', 'large language model', 'prompt', 'fine-tune', 'fine tuning'],
    label: 'LLM Fundamentals', path: 'GenAI-Topics/llm-fundamentals/index.html' },
  { match: ['observability', 'evaluation', 'eval', 'llm-as-judge', 'ragas'],
    label: 'Observability & Eval', path: 'GenAI-Topics/observability/index.html' },
  { match: ['llmops', 'model serving', 'deployment', 'ci/cd for ml'],
    label: 'LLMOps / Deployment', path: 'GenAI-Topics/llmops/index.html' },
  { match: ['reliability', 'distributed systems', 'circuit breaker', 'idempoten'],
    label: 'Reliability & Distributed Systems', path: 'GenAI-Topics/reliability/index.html' },
  { match: ['cost', 'finops', 'token cost', 'cost optimization'],
    label: 'Cost Optimization', path: 'GenAI-Topics/cost-optimization/index.html' },
  { match: ['kubernetes', 'k8s', 'containers', 'docker'],
    label: 'Kubernetes & Containers', path: 'GenAI-Topics/kubernetes/index.html' },
  { match: ['devops', 'iac', 'terraform', 'jenkins', 'canary'],
    label: 'DevOps for AI', path: 'GenAI-Topics/devops-ai/index.html' },
  { match: ['system design', 'architecture', 'design a system', 'scalab'],
    label: 'Requirements → Production (system design)',
    path: 'Personal-SourceCode/Interview_Requirements_to_Production.html' },
  { match: ['snowflake', 'cortex', 'cortex analyst', 'cortex search'],
    label: 'Snowflake Cortex', path: 'Snowflake-Cortex/index.html' },
  { match: ['databricks', 'spark', 'delta lake', 'lakehouse'],
    label: 'Databricks', path: 'Technologies/databricks/index.html' },
  { match: ['dbt', 'analytics engineering'],
    label: 'dbt', path: 'Technologies/dbt/index.html' },
  { match: ['sql', 'window function', 'query tuning'],
    label: 'SQL Interview Q&A', path: 'Personal-SourceCode/SQL_Interview_QA.html' },
  { match: ['data engineering', 'etl', 'elt', 'pipeline', 'cdc'],
    label: 'Data Engineering Interview Q&A', path: 'Personal-SourceCode/DataEngineering_Interview_QA.html' },
  { match: ['python', 'asyncio', 'fastapi'],
    label: 'Python Interview Q&A', path: 'Personal-SourceCode/Python_Interview_QA.html' },
  { match: ['aws', 'lambda', 's3', 'iam', 'cloud'],
    label: 'AWS Interview Q&A', path: 'Personal-SourceCode/AWS_Interview_QA.html' },
  { match: ['security', 'prompt injection', 'guardrail', 'threat'],
    label: 'AI Security', path: 'AI-Security/index.html' },
  { match: ['fde', 'forward deployed', 'customer-facing', 'client-facing'],
    label: 'Forward Deployed Engineer path', path: 'Personal-SourceCode/Path_FDE.html' },
  { match: ['behavioral', 'leadership', 'star', 'stakeholder', 'communication'],
    label: 'Behavioral / STAR Interview Q&A', path: 'Personal-SourceCode/Behavioral_STAR_Interview_QA.html' },
  { match: ['staff', 'principal', 'architect'],
    label: 'Senior / Staff / Principal / FDE', path: 'Personal-SourceCode/Interview_Level_Comparison.html' },
  { match: ['genai', 'generative ai', 'ai engineer'],
    label: 'GenAI Interview Q&A', path: 'Personal-SourceCode/GenAI_Interview_QA.html' },
];

/**
 * Look up a single skill/keyword → resource. Returns {label, path} or null.
 */
function lookupResource(skill) {
  if (!skill || typeof skill !== 'string') return null;
  const s = skill.toLowerCase();
  for (const r of RESOURCES) {
    if (r.match.some((kw) => s.includes(kw))) {
      return { label: r.label, path: r.path };
    }
  }
  return null;
}

/**
 * Given a list of skill strings, return de-duplicated matched resources.
 * Unmatched skills are ignored (caller can note "no matching resource").
 */
function mapSkillsToResources(skills) {
  const seen = new Set();
  const out = [];
  for (const skill of skills || []) {
    const r = lookupResource(skill);
    if (r && !seen.has(r.path)) {
      seen.add(r.path);
      out.push({ skill, ...r });
    }
  }
  return out;
}

module.exports = { lookupResource, mapSkillsToResources, RESOURCES };
