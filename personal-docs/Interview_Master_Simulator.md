---
icon: material/av-timer
---

# Master Interview Simulator

A mixed, cross-category question bank that mimics a real loop, questions jump
between AI, data, cloud, security, and system design, at different levels. Each
one tells you **what's tested**, what a **strong** answer shows, the **weak
patterns** to avoid, a **follow-up**, and the **expected depth**.

!!! tip "How to run a mock"
    Pick a level, answer **out loud** and timed (~2 min), then reveal and compare.
    Don't skip the **follow-up**, that's where loops separate candidates. This
    page does **not** score you; use the strong/weak notes to self-assess and
    revisit the linked deep pages.

!!! abstract "The universal strong-answer shape"
    **Clarify → claim → mechanism → trade-off → how I'd verify.** Weak answers skip
    the trade-off and the verification. Every note below is a variation of this.

---

## AI fundamentals & LLMs

??? question "[Senior] RAG vs fine-tuning — when do you use each?"
    **Tested:** grounding vs training judgment.
    **Strong:** RAG for factual/fresh/cited knowledge (update index, not weights);
    fine-tune for behavior/format/style; names the freshness/provenance trade-off;
    can combine them.
    **Weak:** "fine-tune to add knowledge"; no trade-off; treats them as
    interchangeable.
    **Follow-up:** "Docs change hourly, which?" → RAG + incremental re-index.
    **Depth:** should reach eval (how to measure which is better).

??? question "[Staff] How do you choose a model per request in production?"
    **Tested:** cost/quality/latency trade-off at scale.
    **Strong:** **model routing** (cheap for easy, strong for hard), justified by an
    eval set per class; fallback on failure; safe upgrade pin→eval→canary.
    **Weak:** "use the best model" (ignores cost/latency); no eval.
    **Follow-up:** "classify 'hard' how?" → cheap classifier/heuristic vs outcomes.
    **Depth:** ties routing to measured cost/quality.

## RAG

??? question "[Senior] Design a RAG assistant over internal docs."
    **Tested:** the full retrieval pipeline.
    **Strong:** chunk (semantic) → embed → **hybrid** search → **rerank** →
    assemble within budget → answer only from context with citations; per-user
    access at retrieval; an eval set (recall@k + faithfulness).
    **Weak:** "embed and search" with no hybrid/rerank/eval; no citations; no access
    control.
    **Follow-up:** "It cites the wrong doc." → retrieval problem first (log top-k).
    **Depth:** should separate retrieval eval from answer eval.

??? question "[Staff] Retrieval quality dropped after an ingestion change. Diagnose."
    **Tested:** operating RAG.
    **Strong:** correlate with the change; inspect top-k; check chunking/embedding/
    index; roll back; add **retrieval eval in CI** to prevent recurrence.
    **Weak:** tweaks the prompt (it's a retrieval bug); no eval gate.
    **Follow-up:** "grounded but wrong?" → retrieval miss, not prompting.
    **Depth:** names recall@k as the gating metric.

## Agents & MCP

??? question "[Senior] When do you use an agent vs a fixed pipeline?"
    **Tested:** knowing agents add cost/risk.
    **Strong:** agent when the path depends on intermediate results; fixed chain
    when known (cheaper, more reliable); bound the loop.
    **Weak:** "agents for everything"; no bounds.
    **Follow-up:** "stop a loop?" → step cap + repeated-action detection + budget.
    **Depth:** should mention eval (outcome + trajectory).

??? question "[Staff] Design an agent that can take destructive actions safely."
    **Tested:** least privilege + gating.
    **Strong:** read tools open; write tools **propose→validate(server-side)→approve**;
    idempotency keys; bounded loop; audit; treat tool text as data.
    **Weak:** a broad tool with a `mode` arg; trusts the model to self-limit.
    **Follow-up:** "tool output says 'ignore instructions'." → injection; gated
    regardless.
    **Depth:** the LLM proposes, a deterministic layer executes.

??? question "[Staff] How do you secure third-party MCP servers?"
    **Tested:** AI supply-chain security.
    **Strong:** allowlist, pin/sign + re-review on change (rug pull/tool poisoning),
    least-privilege short-lived creds in the server, sandbox + egress allowlist,
    audit; treat descriptions as untrusted.
    **Weak:** "just connect trusted servers"; no version pinning; creds in prompt.
    **Follow-up:** "detect exfiltration?" → egress allowlist + audit + DLP.
    **Depth:** distinguishes tool-poisoning from a malicious server.

## Security

??? question "[Staff] What's your top security concern for an agent, and how do you contain it?"
    **Tested:** injection understanding.
    **Strong:** **indirect prompt injection** via retrieved/tool content; contain by
    **architecture** (least-privilege gated tools, output guardrails, egress
    control), not prompt wording.
    **Weak:** only mentions direct injection; "tell the model to ignore bad input."
    **Follow-up:** "why gate even with guardrails?" → defense in depth; false
    negatives.
    **Depth:** reaches detect/respond (audit, kill switch).

## Data & cloud

??? question "[Senior] A dashboard got slow after data grew 10x (Snowflake). Diagnose."
    **Tested:** query performance.
    **Strong:** read the **Query Profile**: poor pruning (cluster on the filter),
    spill (size up), exploding joins (grain). Verify from QUERY_HISTORY.
    **Weak:** "add an index" (Snowflake has none); guesses without the profile.
    **Follow-up:** "why cluster not index?" → micro-partition pruning is the
    mechanism.
    **Depth:** knows clustering costs and when it doesn't pay.

??? question "[Senior] A Spark job passes on sample but hangs at scale."
    **Tested:** distributed-data debugging.
    **Strong:** data **skew** in a shuffle; Spark UI shows one lagging task; fix via
    AQE skew-join / broadcast / salt; check partition sizing + spill.
    **Weak:** "add more memory/executors" without diagnosing skew.
    **Follow-up:** "what is a shuffle?" → cross-network redistribution; the cost.
    **Depth:** picks the cheapest fix first (AQE/broadcast before salt).

??? question "[Staff] Design a near-real-time Oracle → warehouse pipeline with history."
    **Tested:** pipeline system design.
    **Strong:** log-based **CDC** → staging → idempotent **MERGE** to current +
    timestamped **history** (SCD2); quality gates; DLQ; lookback for late data.
    **Weak:** query-based CDC (misses deletes); blind inserts (dupes on retry).
    **Follow-up:** "no reliable updated_at?" → log-based CDC.
    **Depth:** idempotency + late-arriving data handled explicitly.

## Production, ops & reliability

??? question "[Staff] One model provider goes down at peak. What happens?"
    **Tested:** reliability design.
    **Strong:** timeouts stop hangs; **circuit breaker** fails fast; **fallback** to
    alternate provider/region or cheaper/cached answer; backoff+**jitter** on
    retries; multi-provider config to prevent.
    **Weak:** "retry until it works" (thundering herd, no jitter, no fallback).
    **Follow-up:** "why jitter?" → avoid synchronized retry storm.
    **Depth:** distinguishes mitigate (now) from prevent (failover).

??? question "[Staff] A prompt change passed unit tests but answers got worse. How does CI catch it?"
    **Tested:** AI CI/CD.
    **Strong:** unit tests can't see quality; needs **golden + regression eval** as
    a gate, plus an injection suite; canary + rollback.
    **Weak:** "add more unit tests"; treats tests-pass as safe.
    **Follow-up:** "regression on top of golden, why?" → absolute scores can look
    fine while worse than prod.
    **Depth:** knows prompts/models are versioned, gated artifacts.

??? question "[Senior] A model-server pod is CrashLoopBackOff. Debug it."
    **Tested:** K8s + serving ops.
    **Strong:** `describe`/`logs --previous`; classic causes = liveness probe firing
    during slow model load (raise initialDelay/startup probe) or OOMKilled (raise
    memory limit).
    **Weak:** bumps restarts without root cause.
    **Follow-up:** "requests vs limits?" → schedule vs cap (throttle/OOM).
    **Depth:** ties probe timing to model-load cold start.

## System design (flagship)

??? question "[Staff/Principal] Design an enterprise AI assistant for 100k employees."
    **Tested:** full end-to-end + level.
    **Strong (Staff):** clarify scale/latency/data-sensitivity first; agent + gated
    tools; per-user access at retrieval; security (indirect injection), reliability,
    observability, cost levers, eval-gated CI/CD; names trade-offs.
    **Strong (Principal):** adds build-vs-buy, cost economics/TCO, governance, org
    standards, long-horizon; reframes the real need.
    **Weak:** jumps to a diagram without clarifying; no security/cost/eval.
    **Follow-up:** "HR data leaked cross-user?" → per-user ACL at retrieval + DLP.
    **Depth:** every box defended with mechanism + trade-off.
    → walk it in [Requirements → Production](Interview_Requirements_to_Production.md)

## FDE / customer

??? question "[FDE] A customer wants 'AI to help support' but the ask is vague. What do you do?"
    **Tested:** ambiguity + customer judgment.
    **Strong:** clarifying questions that scope it (which tickets, data access,
    reversible actions, success metric); propose a **thin shippable slice**;
    integrate with their messy systems; explain trade-offs to a non-engineer.
    **Weak:** starts building a grand system; no clarifying; ignores their
    constraints.
    **Follow-up:** "their data is a mess." → the implementation gap; pragmatic
    ingestion + validation.
    **Depth:** ties the build to the customer's outcome, not tech for its own sake.
    → [FDE Q&A](Forward_Deployed_Engineer_Interview_QA.md)

---

## Run a full mock (suggested set)

Pick one from each area, ~45 min, out loud:

1. **Fundamentals** — RAG vs fine-tune (warm-up)
2. **Design** — the 100k-employee assistant (the main event)
3. **Security** — top agent risk + containment
4. **Data/cloud** — the slow-dashboard or Spark-skew debug
5. **Ops/incident** — provider outage or eval-gate failure
6. **Behavioral** — an impact story ([STAR](Behavioral_STAR_Interview_QA.md))

Then **defend** the design with the [Why-chains](Interview_Why_Chains.md) and
**level-tune** it with the [Level Comparison](Interview_Level_Comparison.md).

!!! note "Related"
    [Cheat Sheets](Interview_Cheat_Sheets.md) ·
    [30-Day Plan](Interview_30_Day_Plan.md) ·
    [Requirements → Production](Interview_Requirements_to_Production.md) ·
    [Production Incident Interviews](Interview_Production_Incidents.md) ·
    [Practice mode](Interview_Practice.md)
