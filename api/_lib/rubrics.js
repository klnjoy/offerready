/**
 * api/_lib/rubrics.js — what a senior / staff interviewer listens for, per
 * topic. The grader rates each criterion 0-3 and the SERVER computes the score
 * from the weights (gradeAnswer.js), so scores are consistent across questions
 * and can be regression-tested (evals/grading).
 *
 * Rating scale used for every criterion:
 *   0  absent or wrong
 *   1  mentioned, but vague / buzzwords / no reasoning
 *   2  solid senior answer: concrete and reasoned
 *   3  staff level: the "staff" note below — depth, judgment, second-order effects
 *
 * Weights in each rubric sum to 100. `required: true` marks the criterion a
 * senior answer cannot skip (usually the trade-off); missing it caps the score.
 *
 * Bump RUBRIC_VERSION whenever criteria or weights change, so stored scores
 * and eval reports can be compared like for like.
 */

'use strict';

const RUBRIC_VERSION = '2026-10-1';

/** @typedef {{ id: string, label: string, weight: number, looks_for: string, staff: string, required?: boolean }} Criterion */
/** @typedef {{ id: string, label: string, match: RegExp[], criteria: Criterion[] }} Rubric */

/** @type {Rubric[]} */
const RUBRICS = [
  {
    id: 'system_design',
    label: 'System design',
    match: [/\bdesign (a|an|the)\b/i, /\bsystem design\b/i, /\barchitect(ure)?\b/i, /\bscale (to|for)\b/i, /\bhigh[- ]level design\b/i, /\b(rate limiter|url shortener|news ?feed|notification system)\b/i],
    criteria: [
      { id: 'scope', label: 'Clarifies requirements and scale', weight: 15, looks_for: 'functional scope, users, read/write volumes, latency/consistency targets stated before designing', staff: 'turns vague asks into explicit numbers and names what is out of scope and why' },
      { id: 'design', label: 'Clear end-to-end design', weight: 20, looks_for: 'main components and how a request or record flows through them', staff: 'design is minimal for the requirements; every component earns its place' },
      { id: 'tradeoff', label: 'Key trade-off and why', weight: 25, required: true, looks_for: 'an explicit choice between real options (e.g. consistency vs latency, push vs pull, SQL vs NoSQL) with the reason tied to the requirements', staff: 'names when the choice would flip and what it costs later' },
      { id: 'scale', label: 'Scaling and bottlenecks', weight: 15, looks_for: 'where it breaks first and how to scale it (partitioning, caching, queues, replication)', staff: 'quantifies the bottleneck and the headroom of the fix' },
      { id: 'reliability', label: 'Failure modes and reliability', weight: 15, looks_for: 'what fails, how it is detected, retries/idempotency, degradation', staff: 'blast radius, graceful degradation and recovery plan' },
      { id: 'operate', label: 'Operating it (metrics, cost)', weight: 10, looks_for: 'SLOs, monitoring, cost or rollout', staff: 'cost model and the metric that tells you it works' },
    ],
  },
  {
    id: 'data_pipeline',
    label: 'Data pipelines and streaming',
    match: [/\bpipeline\b/i, /\betl\b|\belt\b/i, /\bingest/i, /\bstream(ing)?\b/i, /\bkafka\b|\bkinesis\b|\bflink\b|\bspark streaming\b/i, /\bcdc\b|change data capture/i, /\bbatch\b/i, /\bairflow\b|\bdagster\b|\borchestrat/i, /\blate[- ]arriving\b|\bexactly[- ]once\b|\bbackfill/i],
    criteria: [
      { id: 'reqs', label: 'Freshness, volume and SLA', weight: 15, looks_for: 'latency/freshness need, data volume and who consumes the output', staff: 'derives batch vs streaming from the business need, not preference' },
      { id: 'tradeoff', label: 'Architecture choice and trade-off', weight: 20, required: true, looks_for: 'tooling or pattern chosen with the reason and what was given up', staff: 'says when the opposite choice wins' },
      { id: 'correctness', label: 'Correctness under real data', weight: 25, looks_for: 'idempotency, duplicates, late or out-of-order data, schema changes, exactly/at-least-once semantics', staff: 'explains the mechanism (keys, watermarks, merge/upsert) and how correctness is proven' },
      { id: 'scale', label: 'Performance at scale', weight: 15, looks_for: 'partitioning, skew, file sizes, parallelism, state size', staff: 'identifies the specific bottleneck and its fix' },
      { id: 'ops', label: 'Operations and data quality', weight: 15, looks_for: 'monitoring, data quality checks, alerting, backfills and reruns', staff: 'contracts/ownership and safe backfill strategy' },
      { id: 'cost', label: 'Cost awareness', weight: 10, looks_for: 'compute/storage cost and how to control it', staff: 'unit cost per record/table and the lever that moves it' },
    ],
  },
  {
    id: 'data_modeling',
    label: 'Data modeling and warehousing',
    match: [/\bdata model/i, /\bschema\b/i, /\bwarehouse\b|\blakehouse\b|\bsnowflake\b|\bbigquery\b|\bdatabricks\b|\bredshift\b/i, /\bdimension(al)?\b|\bfact table\b|\bstar schema\b/i, /\bscd\b|slowly changing/i, /\bdata vault\b|\bmedallion\b|\bdelta lake\b|\biceberg\b/i, /\bpartition(ing)?\b|\bcluster(ing)? key/i],
    criteria: [
      { id: 'grain', label: 'Grain and access patterns', weight: 20, looks_for: 'the grain of each table and the main queries it must serve', staff: 'designs from the queries and states the grain in one sentence' },
      { id: 'tradeoff', label: 'Model choice and trade-off', weight: 25, required: true, looks_for: 'star vs wide vs normalized (or similar) with the reason', staff: 'explains the cost of the choice for future changes' },
      { id: 'history', label: 'Keys, history and change', weight: 20, looks_for: 'surrogate/natural keys, SCD or snapshot handling, late changes', staff: 'handles corrections and backfills without breaking consumers' },
      { id: 'performance', label: 'Performance design', weight: 20, looks_for: 'partitioning, clustering, file layout, materialization', staff: 'ties layout to the dominant filter and measured pruning' },
      { id: 'quality', label: 'Quality and governance', weight: 15, looks_for: 'tests, contracts, documentation, access control', staff: 'ownership and how breaking changes are rolled out' },
    ],
  },
  {
    id: 'query_performance',
    label: 'Query and job performance',
    match: [/\bslow\b/i, /\boptimi[sz]e\b/i, /\bperformance\b/i, /\bquery plan\b|\bexplain (plan|analyze)\b/i, /\bindex(es|ing)?\b/i, /\bskew\b|\bshuffle\b|\bspill/i, /\bjoin\b/i, /\bwindow function/i, /\bsql\b/i],
    criteria: [
      { id: 'diagnose', label: 'Diagnoses before fixing', weight: 25, looks_for: 'looks at the plan, metrics or profile to find where time goes', staff: 'forms a hypothesis and the measurement that confirms it' },
      { id: 'mechanism', label: 'Root cause mechanism', weight: 25, looks_for: 'explains why it is slow (full scan, skew, shuffle, missing pruning, N+1)', staff: 'explains the engine internals behind it' },
      { id: 'tradeoff', label: 'Fix and its trade-off', weight: 25, required: true, looks_for: 'a specific fix and what it costs (storage, write cost, freshness)', staff: 'ranks fixes by impact vs effort' },
      { id: 'verify', label: 'Verifies the improvement', weight: 15, looks_for: 'before/after numbers or a test', staff: 'guards against regressions with a benchmark or alert' },
      { id: 'example', label: 'Concrete example or numbers', weight: 10, looks_for: 'real sizes, timings or a concrete case', staff: 'numbers that make the impact obvious' },
    ],
  },
  {
    id: 'rag_llm',
    label: 'RAG and LLM applications',
    match: [/\brag\b|retrieval[- ]augmented/i, /\bretriev/i, /\bembedding/i, /\bvector\b/i, /\bchunk/i, /\bllm\b|large language model/i, /\bhallucinat/i, /\bprompt\b/i, /\brerank/i, /\bfine[- ]tun/i],
    criteria: [
      { id: 'framing', label: 'Frames the problem and constraints', weight: 10, looks_for: 'users, data sources, accuracy/latency/cost constraints', staff: 'decides whether RAG is even the right tool' },
      { id: 'retrieval', label: 'Retrieval design', weight: 20, looks_for: 'chunking, embeddings, hybrid search, metadata filters, reranking with reasons', staff: 'tunes retrieval from measured recall, not defaults' },
      { id: 'grounding', label: 'Grounding and guardrails', weight: 15, looks_for: 'citations, refusing when context is missing, prompt structure', staff: 'handles conflicting or stale sources' },
      { id: 'evaluation', label: 'How quality is evaluated', weight: 25, required: true, looks_for: 'an eval set, retrieval and answer metrics, human or LLM judging, regression checks', staff: 'ties evals to release gates and production feedback' },
      { id: 'tradeoff', label: 'Latency and cost trade-offs', weight: 15, looks_for: 'model size, caching, context length, top-k vs cost/latency', staff: 'quantifies cost per query and the lever to cut it' },
      { id: 'ops', label: 'Failure modes and monitoring', weight: 15, looks_for: 'drift, bad retrieval, prompt injection, monitoring in production', staff: 'closes the loop from user feedback to fixes' },
    ],
  },
  {
    id: 'ml_system',
    label: 'ML systems and MLOps',
    match: [/\bml\b|machine learning/i, /\bmodel (training|serving|deployment|registry)\b/i, /\bfeature store\b|\bfeatures?\b/i, /\bdrift\b/i, /\bmlops\b|\bml platform\b/i, /\binference\b/i, /\bgpu\b/i, /\ba\/b test|\bonline experiment/i, /\brecommend(er|ation)/i],
    criteria: [
      { id: 'framing', label: 'Problem, metric and baseline', weight: 15, looks_for: 'the business metric, the ML metric and a simple baseline', staff: 'questions whether ML is needed at all' },
      { id: 'data', label: 'Data and features', weight: 20, looks_for: 'training data, labels, leakage, train/serve consistency', staff: 'point-in-time correctness and feature ownership' },
      { id: 'tradeoff', label: 'Model and serving choice', weight: 20, required: true, looks_for: 'batch vs online, model complexity vs latency, with the reason', staff: 'says what would change the choice' },
      { id: 'evaluation', label: 'Evaluation and rollout', weight: 20, looks_for: 'offline eval, shadow/canary, A/B test', staff: 'guardrail metrics and rollback criteria' },
      { id: 'monitoring', label: 'Monitoring and retraining', weight: 15, looks_for: 'drift, data quality, retraining triggers', staff: 'cost of staleness vs cost of retraining' },
      { id: 'cost', label: 'Cost and scale', weight: 10, looks_for: 'compute/GPU cost, batching, autoscaling', staff: 'unit cost per prediction' },
    ],
  },
  {
    id: 'agents',
    label: 'AI agents and tool use',
    match: [/\bagent(s|ic)?\b/i, /\btool[- ]?(use|calling)\b|\bfunction calling\b/i, /\bmcp\b|model context protocol/i, /\bmulti[- ]agent\b/i, /\bplanner\b|\breact loop\b/i],
    criteria: [
      { id: 'control', label: 'Task breakdown and control flow', weight: 20, looks_for: 'how the agent plans, loops and stops; workflow vs free agent choice', staff: 'uses the least autonomy that solves the task' },
      { id: 'tools', label: 'Tool design and permissions', weight: 20, looks_for: 'clear tool contracts, scoped permissions, inputs validated', staff: 'designs tools so mistakes are cheap and reversible' },
      { id: 'reliability', label: 'Reliability', weight: 20, looks_for: 'retries, timeouts, loop limits, state and recovery', staff: 'idempotent actions and checkpoints' },
      { id: 'safety', label: 'Safety and prompt injection', weight: 20, required: true, looks_for: 'untrusted content handling, least privilege, human approval for risky actions', staff: 'threat model for each tool' },
      { id: 'evaluation', label: 'Evaluation and observability', weight: 20, looks_for: 'task success metrics, traces, regression suites', staff: 'replayable traces and eval gates before release' },
    ],
  },
  {
    id: 'ai_security',
    label: 'AI and application security',
    match: [/\bsecurity\b|\bsecure\b/i, /\bprompt injection\b|\bjailbreak/i, /\bpii\b|\bprivacy\b|\bgdpr\b|\bhipaa\b/i, /\bthreat model/i, /\bauth(n|z|entication|orization)?\b/i, /\bencrypt/i, /\bguardrail/i, /\bcompliance\b/i],
    criteria: [
      { id: 'threats', label: 'Threat model', weight: 25, looks_for: 'assets, attackers and the main attack paths', staff: 'prioritizes threats by impact and likelihood' },
      { id: 'controls', label: 'Specific layered controls', weight: 25, looks_for: 'concrete controls at several layers (input, model, output, data, identity)', staff: 'explains why one control is not enough' },
      { id: 'privilege', label: 'Least privilege and isolation', weight: 20, looks_for: 'scoped access, secrets handling, sandboxing', staff: 'limits blast radius by design' },
      { id: 'detect', label: 'Detection and response', weight: 15, looks_for: 'logging, alerts, incident handling', staff: 'red-teaming and measured detection rates' },
      { id: 'tradeoff', label: 'Security vs usability trade-off', weight: 15, required: true, looks_for: 'what the controls cost users or latency and why it is acceptable', staff: 'risk-based decision with the business' },
    ],
  },
  {
    id: 'api_serving',
    label: 'APIs, FastAPI and serving',
    match: [/\bfastapi\b|\bflask\b|\bdjango\b/i, /\bapi\b|\brest\b|\bgrpc\b|\bendpoint/i, /\basync\b|\bawait\b|\bevent loop\b/i, /\bmicroservice/i, /\brate limit/i, /\bpydantic\b/i, /\buvicorn\b|\bgunicorn\b/i],
    criteria: [
      { id: 'contract', label: 'API contract', weight: 15, looks_for: 'resources, request/response models, errors, versioning', staff: 'designs for backward compatibility' },
      { id: 'mechanism', label: 'Concurrency mechanism', weight: 25, looks_for: 'async vs sync, event loop blocking, workers/threads and why', staff: 'explains exactly what blocks and how to avoid it' },
      { id: 'tradeoff', label: 'Performance choices and trade-offs', weight: 20, required: true, looks_for: 'caching, pooling, timeouts, batching with what each costs', staff: 'measures p95/p99 and picks the lever' },
      { id: 'reliability', label: 'Reliability', weight: 20, looks_for: 'idempotency, retries, rate limiting, graceful shutdown', staff: 'backpressure and failure isolation' },
      { id: 'quality', label: 'Testing, security and observability', weight: 20, looks_for: 'tests, auth, logging/metrics/tracing', staff: 'contract tests and SLO alerts' },
    ],
  },
  {
    id: 'platform',
    label: 'Platform, infra and reliability',
    match: [/\bkubernetes\b|\bk8s\b/i, /\bterraform\b|\binfrastructure as code\b/i, /\bci\/?cd\b|\bdeploy(ment)?\b/i, /\bplatform team\b|\binternal platform\b|\bdeveloper experience\b/i, /\bobservability\b|\bmonitoring\b/i, /\bsre\b|\bincident\b|\bon[- ]call\b|\boutage\b/i, /\bcloud cost\b|\bfinops\b/i, /\bmulti[- ]region\b|\bdisaster recovery\b/i],
    criteria: [
      { id: 'goals', label: 'Goals and users', weight: 15, looks_for: 'who the platform serves and what problem it removes', staff: 'treats the platform as a product with adoption metrics' },
      { id: 'tradeoff', label: 'Design choice and trade-off', weight: 25, required: true, looks_for: 'tool or pattern chosen with the reason and the cost', staff: 'build vs buy reasoning' },
      { id: 'reliability', label: 'Reliability and rollout', weight: 20, looks_for: 'safe rollouts, rollback, redundancy, SLOs', staff: 'error budgets drive decisions' },
      { id: 'observe', label: 'Observability and incidents', weight: 20, looks_for: 'metrics, logs, traces, alerting, incident process', staff: 'blameless follow-up that removes a class of failure' },
      { id: 'cost', label: 'Cost and governance', weight: 20, looks_for: 'cost visibility, ownership, guardrails', staff: 'cost tied to teams and unit economics' },
    ],
  },
  {
    id: 'customer',
    label: 'Customer-facing engineering (FDE)',
    match: [/\bcustomer\b|\bclient\b/i, /\bforward[- ]deployed\b|\bfde\b/i, /\bproof of concept\b|\bpoc\b|\bpilot\b/i, /\brequirements gathering\b|\bdiscovery\b/i, /\bimplementation\b|\bonboarding\b/i],
    criteria: [
      { id: 'discovery', label: 'Understands the customer problem', weight: 25, looks_for: 'asks about the real goal, users, constraints and success measure', staff: 'separates what they ask for from what they need' },
      { id: 'tradeoff', label: 'Scopes a solution and trade-off', weight: 25, required: true, looks_for: 'what to build first and what to defer, with the reason', staff: 'smallest thing that proves value' },
      { id: 'delivery', label: 'Delivers under real constraints', weight: 20, looks_for: 'integration, data access, security review, timelines', staff: 'de-risks the hardest dependency first' },
      { id: 'communication', label: 'Communication and expectations', weight: 15, looks_for: 'updates, saying no, escalation', staff: 'turns disagreement into a decision with the customer' },
      { id: 'outcome', label: 'Success measure and handoff', weight: 15, looks_for: 'measurable result and how it continues without you', staff: 'feeds learnings back into the product' },
    ],
  },
  {
    id: 'leadership',
    label: 'Leadership and delivery',
    match: [/\blead(ing|ership)?\b/i, /\bmanag(e|er|ing)\b/i, /\bmentor/i, /\bprioriti[sz]/i, /\broadmap\b/i, /\bstakeholder/i, /\bcross[- ]team\b|\bcross[- ]functional\b/i, /\btech debt\b/i, /\bhiring\b/i],
    criteria: [
      { id: 'context', label: 'Context and goal', weight: 15, looks_for: 'the situation, stakes and goal in a few sentences', staff: 'frames it in business terms' },
      { id: 'ownership', label: 'What you personally did', weight: 25, required: true, looks_for: 'specific actions by the candidate ("I"), not just the team', staff: 'influence beyond their own team' },
      { id: 'judgment', label: 'Judgment and trade-off', weight: 25, looks_for: 'the hard call, options considered and why', staff: 'balances short-term delivery with long-term health' },
      { id: 'result', label: 'Result with evidence', weight: 20, looks_for: 'measurable outcome', staff: 'lasting change (process, people, system)' },
      { id: 'reflection', label: 'Reflection', weight: 15, looks_for: 'what they learned or would do differently', staff: 'shows how it changed their approach since' },
    ],
  },
  {
    id: 'behavioral',
    label: 'Behavioral (STAR)',
    match: [/\btell me about a time\b/i, /\bdescribe a (time|situation)\b/i, /\bgive (me )?an example\b/i, /\bconflict\b|\bdisagree/i, /\bfailure\b|\bmistake\b|\bfailed\b/i, /\bproud\b|\bchalleng(e|ing) project\b/i, /\bwhy (do you want|this company|are you leaving)\b/i, /\bbehaviou?ral\b|\bstar\b/i],
    criteria: [
      { id: 'situation', label: 'Situation and stakes', weight: 15, looks_for: 'short context and why it mattered', staff: 'stakes in business or customer terms' },
      { id: 'actions', label: 'Your own actions', weight: 30, required: true, looks_for: 'concrete steps the candidate took ("I"), not "we"', staff: 'shows initiative and influence without authority' },
      { id: 'judgment', label: 'Decision and reasoning', weight: 20, looks_for: 'options considered and why they chose one', staff: 'handles ambiguity and disagreement well' },
      { id: 'result', label: 'Result, ideally measured', weight: 20, looks_for: 'outcome with a number or clear evidence', staff: 'impact beyond the immediate task' },
      { id: 'reflection', label: 'Reflection', weight: 15, looks_for: 'what they learned or would change', staff: 'honest about their own mistakes' },
    ],
  },
  {
    id: 'general',
    label: 'Technical depth',
    match: [],
    criteria: [
      { id: 'answer', label: 'Answers the question directly', weight: 20, looks_for: 'a clear position or answer early on', staff: 'leads with the conclusion, then supports it' },
      { id: 'mechanism', label: 'Explains how it works', weight: 25, looks_for: 'the mechanism behind the claim, not just the name of a tool', staff: 'explains internals that matter for the decision' },
      { id: 'tradeoff', label: 'Trade-offs and when not to', weight: 25, required: true, looks_for: 'what the approach costs and when another option is better', staff: 'states the condition that flips the decision' },
      { id: 'example', label: 'Concrete example or numbers', weight: 15, looks_for: 'a real scenario, sizes or results', staff: 'experience-backed detail' },
      { id: 'risks', label: 'Failure modes and verification', weight: 15, looks_for: 'what can go wrong and how to check it works', staff: 'measurable success criteria' },
    ],
  },
];

const BY_ID = new Map(RUBRICS.map((r) => [r.id, r]));

/** Category hints the app sends (question categories, drill slugs, bank topics). */
const HINT_ALIASES = [
  [/system[_\s-]?design|architecture|architect/i, 'system_design'],
  [/pipeline|streaming|kafka|etl|ingest|orchestrat|airflow|cdc/i, 'data_pipeline'],
  [/model(l)?ing|warehouse|lakehouse|schema|dimensional/i, 'data_modeling'],
  [/sql|performance|optimi[sz]/i, 'query_performance'],
  [/rag|llm|genai|gen-ai|prompt|retrieval/i, 'rag_llm'],
  [/agent|mcp/i, 'agents'],
  [/ml|mlops|machine|platform-ml|ml_platform/i, 'ml_system'],
  [/security|privacy/i, 'ai_security'],
  [/fastapi|api|serving|backend/i, 'api_serving'],
  [/platform|infra|devops|sre|reliab|cloud|cost/i, 'platform'],
  [/fde|customer|client/i, 'customer'],
  [/leader|lead|manag|delivery/i, 'leadership'],
  [/behavio|star|culture/i, 'behavioral'],
];

/**
 * Pick the rubric for a question. The topic hint (category / drill slug /
 * bank topic) wins when it maps cleanly; otherwise score the question text
 * against each rubric's patterns. Behavioral phrasing beats technical terms
 * ("tell me about a time you fixed a slow pipeline" is behavioral).
 */
function selectRubric(question, hint) {
  const q = String(question || '');
  const h = String(hint || '');
  if (/\btell me about a time\b|\bdescribe a (time|situation)\b|\bgive (me )?an example of a time\b/i.test(q)) {
    return /lead|manag|mentor|team|stakeholder|priorit/i.test(q) ? BY_ID.get('leadership') : BY_ID.get('behavioral');
  }
  if (h) {
    for (const [re, id] of HINT_ALIASES) if (re.test(h)) return BY_ID.get(id);
  }
  let best = null;
  let bestScore = 0;
  for (const r of RUBRICS) {
    let s = 0;
    for (const re of r.match) if (re.test(q)) s++;
    if (s > bestScore) { best = r; bestScore = s; }
  }
  return best || BY_ID.get('general');
}

function getRubric(id) {
  return BY_ID.get(id) || null;
}

module.exports = { RUBRIC_VERSION, RUBRICS, selectRubric, getRubric };
