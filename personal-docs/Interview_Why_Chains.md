---
icon: material/comment-question
---

# The Interviewer Keeps Asking "Why"

Senior and principal interviews aren't about definitions, they're about whether
you can **defend a decision** three, five, seven layers deep. Every answer earns
another "why?" or "what if?" This page trains that muscle: chains of follow-ups
with the reasoning a strong candidate gives at each level.

!!! tip "How to use this"
    For each chain: read the top question, answer it **out loud**, then reveal the
    next "why". Try to answer *before* peeking. The goal is to reach the bottom of
    a chain without hand-waving, and to say "here's the trade-off" instead of
    "it's best practice."

!!! abstract "The pattern behind every good answer"
    **Claim → because (mechanism) → trade-off → how I'd verify.** If you can't name
    the trade-off and the verification, you're reciting, not reasoning. That's what
    the "why" chain exposes.

---

## Chain 1 — RAG

??? question "Why RAG (and not fine-tuning or a bigger prompt)?"
    The knowledge is large, changes often, and answers must cite sources. RAG keeps
    facts fresh (update the index, not weights) and auditable. Fine-tuning teaches
    behavior/format, not volatile facts. → *Why not just stuff it all in the
    prompt?* Context is a budget: cost, latency, and lost-in-the-middle degrade
    quality; you retrieve only what's relevant. → *Why hybrid search?* Pure vector
    misses exact terms (IDs, codes); keyword misses paraphrase; hybrid gets both. →
    *Why a reranker on top?* Hybrid gives good recall but noisy order; a reranker
    fixes precision of the top-k. → *Why that k?* Tuned on an eval set, enough
    context without diluting relevance or blowing the budget. → *How did you
    evaluate retrieval?* recall@k / MRR on a labeled set, separate from answer
    quality. → *What happens when retrieval fails / returns nothing?* Answer "not
    found," never fabricate; log it; it's a retrieval bug to fix, not a prompt one.
    → *How do you handle a poisoned document in the corpus?* Provenance + review at
    ingestion, per-user access at retrieval, and treat retrieved text as data not
    instructions. → *How do you know a change improved things?* Regression eval vs
    the current version on the same set, not vibes.

---

## Chain 2 — Model selection

??? question "Why did you pick this model?"
    It met the task's quality bar at acceptable latency and cost, with the tool-use
    / structured-output / context-window it needed. → *Why not the strongest model
    for everything?* Cost and latency; most queries don't need it. → *So how do you
    decide per request?* **Model routing** — a cheap model handles easy cases,
    escalate hard ones. → *How do you classify "hard"?* A cheap classifier or
    heuristic on the query; measured against outcomes. → *How do you know the cheap
    model is good enough?* It passes the eval set for that query class. → *What
    happens when the provider is down?* Fallback to an alternate model or a
    cached/degraded answer; timeouts + retries. → *How do you upgrade a model
    version safely?* Pin it; run golden + regression eval; canary; monitor; roll
    back, models drift, never auto-upgrade.

---

## Chain 3 — Agents

??? question "Why an agent instead of a fixed pipeline?"
    The path depends on intermediate results, the model must plan and choose tools.
    → *Why not always use an agent then?* Agents add latency, cost, and failure
    modes; if the path is known, a chain is cheaper and more reliable. → *How do you
    stop it looping?* Step cap, cost budget, repeated-action detection. → *Why
    separate read and write tools?* Least privilege, a hijacked or confused agent
    can't do damage it isn't permitted. → *How do you let it take a destructive
    action safely?* Propose-then-approve: the model proposes, a deterministic layer
    validates and a human gates. → *Why not trust the model to self-limit?* It's
    non-deterministic and injectable; safety must be structural. → *How do you
    evaluate an agent?* Outcome *and* trajectory (were the steps sensible), plus
    component metrics (routing accuracy, tool-arg validity). → *When do you go
    multi-agent?* Only when domains genuinely differ; otherwise coordination cost
    isn't justified.

---

## Chain 4 — MCP

??? question "Why MCP instead of hand-wiring tools?"
    It standardizes tool discovery/description/execution so a tool written once is
    reusable across clients and models. → *How is that different from function
    calling?* Function calling is the model *choosing* a tool; MCP is the protocol
    that delivers the catalog and routes the call, complementary. → *What's the
    risk of connecting an MCP server?* Supply chain: a malicious server, tool
    poisoning via descriptions, rug pulls, excessive permissions, exfiltration. →
    *How do you contain that?* Allowlist trusted servers, pin/sign tools and
    re-review on change, least-privilege short-lived creds held by the server,
    sandbox with egress control, audit all I/O. → *Why treat the tool description
    as untrusted?* It enters the model's context, it can carry hidden instructions.
    → *Where do credentials live?* In the server, never the prompt.

---

## Chain 5 — Data platform (Snowflake / Databricks)

??? question "Why keep the GenAI inside Snowflake (Cortex) rather than an external LLM?"
    Data never leaves the governance boundary, existing RBAC/masking/row-access
    apply, no egress. → *Why does that matter?* Compliance and blast radius; you
    don't re-implement access control per tool. → *When would you use an external
    model instead?* Streaming multi-turn chat, a capability Cortex doesn't offer,
    or a model you specifically need. → *A dashboard got slow after 10x growth,
    why, and how do you find it?* Read the Query Profile: poor pruning (cluster on
    the filter), spill (size up), exploding joins (grain bug). → *Why cluster
    instead of "add an index"?* Snowflake has no b-tree indexes; pruning of
    micro-partitions is the mechanism, clustering aligns data to the filter. →
    *Why not cluster everything?* Reclustering costs credits; it only pays off on
    large tables with selective filters.

---

## Chain 6 — Security

??? question "Why is prompt injection your top concern for this agent?"
    The model follows natural-language instructions, so untrusted text is a
    control-flow risk, and an agent *acts*. → *Direct injection isn't the scary
    one, why?* Indirect: malicious instructions ride in through retrieval/tools you
    trust. → *So how do you actually stop it?* You don't rely on prompt wording, you
    contain by architecture: least-privilege gated tools mean a hijack can't do
    harm. → *Why gate even after guardrails?* Defense in depth; guardrails have
    false negatives. → *How would you detect an attempt?* Safety-filter hits, tool
    I/O audit, anomaly on retrieved sources. → *And respond?* Kill switch, revoke
    tokens, quarantine the source, rollback.

---

## Chain 7 — Cost

??? question "Why did your AI feature's cost triple, and how do you defend the fix?"
    Usually tokens: bigger context, no caching, a runaway agent loop, or routing
    everything to the strong model. → *Why start with routing?* Most queries are
    easy; a cheaper model passes eval for them. → *Why not just cache?* Cache too,
    exact + semantic, but caching alone won't fix over-sized context or loops. →
    *Won't cutting context hurt quality?* Only if you cut *relevant* context;
    retrieve less-but-right and measure on the eval set. → *How do you prove you
    didn't regress?* Regression eval before/after; watch quality + cost + latency
    together, a Principal balances all three, not cost alone.

---

## Chain 8 — Observability & CI/CD

??? question "Why isn't 'all unit tests pass' enough to deploy an AI change?"
    An AI system can regress with zero code change, a prompt or model tweak shifts
    quality. → *So what gates the deploy?* Golden-dataset eval (meet a bar) +
    regression eval (no drop vs prod). → *Why regression on top of golden?* Absolute
    scores can look fine while you've quietly gotten worse than production. → *What
    security gate for AI specifically?* A prompt-injection / jailbreak suite +
    output-guardrail check, beyond dependency/secret scans. → *After deploy?* Canary
    + monitor quality/cost/latency/safety; auto-rollback on regression. → *How do
    you debug a bad agent run?* Traces + checkpointed state to replay and find the
    failing step.

---

## Practice this yourself

Take any decision from your projects and run the drill:

- [ ] State the **claim** (what you chose)
- [ ] Give the **mechanism** (why it works)
- [ ] Name the **trade-off** (what you gave up / the alternative)
- [ ] Say how you'd **verify** (metric, test, canary)
- [ ] Then ask yourself "**why?**" again, five times, until you hit bedrock

If any level is "it's best practice" or "it's faster" with no mechanism, that's
the level an interviewer will attack. Fix it before they find it.

!!! note "Related"
    Apply these against the concept pages:
    [RAG](../GenAI-Topics/rag/index.md) · [Agent Principles](../GenAI-Topics/agent-principles/index.md) ·
    [MCP](../GenAI-Topics/mcp/index.md) · [AI Security](../AI-Security/index.md) ·
    [LLMOps](../GenAI-Topics/llmops/index.md). Then defend a full design in
    [Requirements → Production](Interview_Requirements_to_Production.md).
