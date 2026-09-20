---
icon: material/card-text
---

# Master Cheat Sheets

Dense, last-minute recall sheets across the whole stack, the facts and framings
you want fresh the morning of an interview. Each links to the deep page if you
need to reopen it.

!!! tip "Use the night before"
    Skim top-to-bottom; anything you can't explain in a sentence, reopen the
    linked deep page. These are triggers for recall, not a substitute for the
    deep-dives.

---

## LLM fundamentals

- **Token** = sub-word unit; cost + context are counted in tokens.
- **Temperature** 0 = deterministic; higher = more random. **top-p/top-k** = nucleus/rank sampling.
- **Context window** = max tokens in/out; big context ≠ better (lost-in-the-middle, cost).
- **Function/tool calling** = model emits structured args for a described tool.
- **RAG vs fine-tune:** RAG = facts/fresh/cited; fine-tune = behavior/format/style.
- Model choice = quality × latency × cost × context × tool-use × safety.
→ [LLM Fundamentals](../GenAI-Topics/llm-fundamentals/index.md)

## RAG

- Pipeline: chunk → embed → **hybrid** search (vector+keyword) → **rerank** → assemble (budget) → grounded answer + citations.
- Chunk to **semantic units**; overlap preserves context.
- Same embedding model for docs + queries.
- Eval retrieval (recall@k/MRR) **separately** from answers (faithfulness).
- Most "hallucinations" are **retrieval misses** — fix recall first.
- Retrieval down → degrade honestly, never hallucinate.
→ [RAG](../GenAI-Topics/rag/index.md)

## Agents

- Loop: **plan → act → observe** until done or capped.
- Patterns: ReAct · plan-execute · reflection · router · supervisor/multi-agent · evaluator-optimizer.
- Reliability: **step cap + cost budget + repeated-action detection**.
- Least privilege: read tools open, **writes validated + gated**.
- Single-agent by default; multi-agent only for truly distinct domains.
- Eval **outcome + trajectory**, not just final answer.
→ [Agent Principles](../GenAI-Topics/agent-principles/index.md)

## MCP

- Standard protocol: **tools, resources, prompts**; client (app) ↔ server (exposes).
- MCP vs function calling: protocol/transport vs model capability (complementary).
- MCP vs A2A: agent→tools vs agent↔agent.
- Risks: malicious server, **tool poisoning** (description), rug pull, excessive perms, exfiltration.
- Controls: allowlist, pin/sign, least-privilege short-lived creds (in server), sandbox+egress, audit.
→ [MCP](../GenAI-Topics/mcp/index.md)

## AI Security

- #1 principle: **untrusted text ≠ instructions; contain by architecture.**
- **Indirect injection** (via retrieved/tool content) is the agent killer.
- Insecure output handling = model output into SQL/shell/HTML/`eval` unchecked.
- Controls: least-privilege gated tools, input+output guardrails, egress allowlist, secrets in a manager, audit.
- Threat model: assets→actors→boundaries→surface→threats→controls→detect/respond.
→ [AI Security](../AI-Security/index.md)

## Snowflake

- Decoupled **storage/compute**; micro-partitions + **pruning** (no b-tree indexes).
- Scale **up** = bigger warehouse (heavy query); **out** = multi-cluster (concurrency).
- Time Travel (1d, up to 90) vs Fail-safe (7d, disaster) vs zero-copy clone.
- Streams+Tasks (imperative CDC) vs Dynamic Tables (declarative).
- **Cortex** = in-account GenAI (Analyst = NL→SQL, Search = RAG, LLM funcs); no egress, RBAC applies.
- Slow query → Query Profile: pruning, spill, exploding joins.
→ [Snowflake](../Technologies/snowflake/index.md) · [Snowflake Q&A](Snowflake_Interview_QA.md)

## Databricks / Spark / Delta

- Lazy transforms build a DAG; **actions** trigger; **shuffle** is the cost.
- Data **skew** → AQE skew-join / **broadcast** small side / **salt** the key.
- `repartition` (full shuffle) vs `coalesce` (no full shuffle).
- Delta: **transaction log** → ACID/time-travel/MERGE; **OPTIMIZE** (small files) + **VACUUM**.
- Partitioning vs Z-order vs liquid clustering; medallion bronze/silver/gold.
→ [Databricks Q&A](Databricks_Interview_QA.md)

## SQL

- `ROW_NUMBER` (unique) vs `RANK` (ties+gap) vs `DENSE_RANK` (ties+no gap).
- Window ≠ GROUP BY (keeps row detail). Dedup: ROW_NUMBER over key ORDER BY ts DESC = 1.
- `NOT IN` + NULL → zero rows (use `NOT EXISTS`). `WHERE` before group, `HAVING` after.
- Function on a filter column defeats index/pruning.
- Gaps-and-islands: `date − ROW_NUMBER()` = group key. SCD2 = versioned rows.
→ [SQL Q&A](SQL_Interview_QA.md)

## Python

- **GIL**: threads don't parallelize CPU; use processes / native. I/O-bound → threads/asyncio.
- Generators stream (flat memory); lists materialize.
- Mutable default arg = shared state bug (use `None`). `is` = identity, `==` = value.
- Idempotent ETL = keyed upsert + atomic swap + checkpoint.
- Pydantic validates at boundaries.
→ [Python Q&A](Python_Interview_QA.md)

## Kubernetes

- Pod (unit) · Deployment (replicas) · Service (LB) · Ingress (HTTP) · HPA (scale).
- **Requests** schedule; **limits** cap (CPU throttle / mem OOMKill).
- AI: request GPUs explicitly; **generous readiness delay** for model load; autoscale on GPU/queue, not CPU.
- Secrets = KMS-backed, mounted, never in image. Batch = Job/CronJob.
→ [Kubernetes](../GenAI-Topics/kubernetes/index.md)

## DevOps / CI-CD

- Everything as code; build **one immutable image** (SHA tag), promote it; externalize config.
- Rolling vs blue/green vs **canary** (best for AI). Feature flags decouple deploy from release.
- IaC: plan→review→apply, state locking, watch drift.
- **Kiro** = AI-assisted dev; **Jenkins** = production CI/CD gate (complementary, not a replacement).
- AI change gate: **golden + regression eval + injection suite**, not just unit tests.
→ [DevOps for AI](../GenAI-Topics/devops-ai/index.md) · [DevOps Q&A](DevOps_Interview_QA.md)

## LLMOps / AgentOps

- Managed API (fast, no ops) vs self-host vLLM/TGI (control, fixed cost, data-in).
- Cost levers: **routing** + **caching** (prompt/semantic) + **token budgets**.
- Version + eval-gate **prompts, models, datasets, retrieval config** as code.
- Safe upgrade: pin → eval → canary → monitor → rollback (models drift).
- AgentOps adds: tool registry, trajectory eval, loop/cost guards, HITL queues, replay.
→ [LLMOps](../GenAI-Topics/llmops/index.md)

## Reliability

- Every remote call fails: **timeout + retry (backoff+jitter) + circuit-break + fallback**.
- **Jitter** prevents thundering herd. Retry only transient (429/5xx/timeout).
- **Idempotency** makes retries/agent actions safe. Bulkhead isolates pools.
- Backpressure > unbounded buffering. Provider down → circuit-break → fallback.
→ [Reliability](../GenAI-Topics/reliability/index.md)

## Cost & performance

- Cost = requests × avg tokens × price − cache hits. Watch context size + agent loops.
- Levers: routing, caching, trim *relevant* context, batch, stream (perceived latency).
- Prove no regression with **regression eval**; balance quality/latency/reliability/cost.
→ [Cost Optimization](../GenAI-Topics/cost-optimization/index.md)

## System design (the shape of an answer)

1. **Clarify** scale, latency, data sensitivity **first**.
2. Data & identity (SSO, per-user access at retrieval).
3. Architecture (model/RAG/agent/tools).
4. **Security** (indirect injection, gated writes, egress).
5. Reliability + observability (timeouts/fallback, tracing, SLOs).
6. Cost + scale. 7. Governance + DR. 8. Verify + roll out (eval-gated, canary).
- Every box: **mechanism + trade-off + how I'd verify.**
→ [Requirements → Production](Interview_Requirements_to_Production.md) · [Case Studies](../Case-Studies/index.md)

!!! note "Related"
    [Master Interview Simulator](Interview_Master_Simulator.md) ·
    [30-Day Prep Plan](Interview_30_Day_Plan.md) ·
    [Level Comparison](Interview_Level_Comparison.md) ·
    [Overview & Study Path](Interview_Guide_Overview.md)
