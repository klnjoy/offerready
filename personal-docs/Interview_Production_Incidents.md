---
icon: material/fire-alert
---

# Production Incident Interviews

"Walk me through an incident" questions test how you **operate** AI systems under
pressure, not what you memorized. Each incident follows an SRE-style structure:
**symptoms → investigate → telemetry → root cause → mitigate → permanent fix →
prevention → follow-ups.**

!!! tip "The rule that scores points"
    **Restore service first, investigate second.** Mitigate the user-facing impact
    (rollback, fallback, kill switch), *then* find root cause. Debugging a burning
    prod is the classic junior mistake. Always separate **mitigation** (stop the
    bleeding now) from **permanent fix** (so it can't recur).

!!! abstract "How to practice"
    Read the symptom, then talk through the whole structure **before** revealing.
    Say what telemetry you'd look at first, that's usually what's really being
    probed.

---

??? question "Incident 1 — RAG accuracy dropped after a document-ingestion change."
    **Symptoms:** faithfulness fell; more wrong citations / "I don't know", right
    after an ingestion deploy.
    **Investigate:** correlate with the change window; sample failing queries and
    inspect **retrieved top-k** — is the right chunk even retrieved?
    **Telemetry:** recall@k on an eval set, chunk sizes/counts, embedding
    model/version, index freshness.
    **Root cause (typical):** chunking changed, a different embedding model, or the
    index didn't fully rebuild → retrieval degraded, so generation degraded.
    **Mitigate:** roll back the ingestion change / restore the prior index.
    **Permanent fix:** correct chunking/embedding config; re-index; pin the
    embedding model consistently for docs + queries.
    **Prevention:** **retrieval eval in CI** (recall@k) gating ingestion changes;
    alert on retrieval-quality drop.
    **Follow-ups:** "grounded but wrong?" → retrieval miss, not a prompt bug. "Eval
    retrieval how?" → labeled query→relevant-doc set, recall@k / MRR.

??? question "Incident 2 — The agent is suddenly making too many tool calls."
    **Symptoms:** latency + cost up; steps-per-task climbing.
    **Investigate:** pull **traces**; read the step sequence for affected runs.
    **Telemetry:** steps-per-task, repeated-action count, tool-failure rate,
    cost/task.
    **Root cause:** a tool started erroring/returning ambiguous results so the agent
    retries/re-plans in a near-loop; or a prompt/tool-description change worsened
    tool selection.
    **Mitigate:** tighten the **step cap** + cost budget; circuit-break the failing
    tool.
    **Permanent fix:** fix the tool / its error messages; sharpen tool descriptions;
    add repeated-action detection.
    **Prevention:** alert on steps-per-task; **trajectory eval** in CI catches
    routing/looping regressions.
    **Follow-ups:** "How stop a loop generally?" → step cap + repeated-action
    detection + cost budget.

??? question "Incident 3 — AI cost increased 3x with no traffic change."
    **Symptoms:** spend alarm; cost/request up, traffic flat.
    **Investigate:** break down **cost/request** by route/model/feature; diff
    against last week.
    **Telemetry:** tokens in/out, model mix, cache hit rate, context size, agent
    steps.
    **Root cause:** a change grew context (more retrieved chunks / longer history),
    routing sent everything to the expensive model, caching broke, or an agent-loop
    regression.
    **Mitigate:** revert the offending change; restore routing/caching; put a token
    budget cap in place.
    **Permanent fix:** right-size context, fix model routing, re-enable prompt/
    semantic caching, cap max tokens + loop steps.
    **Prevention:** **cost in the eval/CI report**; budget alerts; cost/request SLO.
    **Follow-ups:** "cut cost without hurting quality?" → route + cache + trim
    *relevant* context; prove with regression eval.

??? question "Incident 4 — Sensitive data appeared in a response."
    **Symptoms:** a user saw PII/secret they shouldn't; possibly reported, not
    alerted (worrying on its own).
    **Investigate:** scope (which users/queries/since when); trace the path — did
    retrieval fetch docs the user can't see, did a tool return raw PII, did the
    output guardrail miss it?
    **Telemetry:** retrieved source IDs per answer, tool I/O, guardrail hits, access
    logs.
    **Root cause:** **per-user access not enforced at retrieval** (row/doc ACL
    gap), missing masking at source, or output filter gap.
    **Mitigate:** disable the offending path / add an output filter **now**; if a
    real leak, follow incident-response (contain, notify per policy).
    **Permanent fix:** enforce per-user access **at retrieval**, mask at source,
    add DLP on outputs.
    **Prevention:** access tests + a PII red-team in the guardrail/eval suite;
    audit retrieved sources per answer.
    **Follow-ups:** "why enforce at retrieval not the prompt?" → prompt rules are
    bypassable; access must be structural.

??? question "Incident 5 — Model latency doubled."
    **Symptoms:** p95 up; users notice slowness/timeouts.
    **Investigate:** trace **latency by hop** (model vs retrieval vs tool vs DB) to
    find the bottleneck; correlate with a deploy or provider status.
    **Telemetry:** per-hop latency, model TTFT/total, queue depth, concurrency.
    **Root cause:** provider-side latency spike, a bigger prompt/context, more
    concurrency at peak, or a slow tool/DB call in the chain.
    **Mitigate:** timeouts + fallback (cheaper/faster model or cached answer); scale
    out; shed load.
    **Permanent fix:** address the specific hop (trim context, parallelize
    independent calls, fix the slow query, add capacity/routing).
    **Prevention:** latency SLO + alert; load test at peak; streaming to cut
    perceived latency.
    **Follow-ups:** "how find the bottleneck?" → per-hop tracing, not guessing.

??? question "Incident 6 — An MCP tool/server was compromised."
    **Symptoms:** anomalous tool behavior/outputs, unexpected egress, or a security
    alert.
    **Investigate:** audit **tool I/O logs**; check whether a tool version/
    description changed (rug pull); review the server's permissions and egress.
    **Telemetry:** tool-call audit, egress logs, tool version diffs, credential use.
    **Root cause:** malicious/compromised server, **tool poisoning** via
    description, a rug-pull update, or over-broad credentials enabling exfiltration.
    **Mitigate:** **remove the server from the allowlist**, revoke its credentials,
    kill affected sessions.
    **Permanent fix:** pin/sign tool versions, re-review on change, least-privilege
    short-lived creds held by the server, sandbox with egress allowlist.
    **Prevention:** allowlist + signing + I/O audit + egress control by default;
    treat tool descriptions as untrusted.
    **Follow-ups:** "how detect exfiltration?" → egress allowlist + audit + DLP on
    tool outputs.

??? question "Incident 7 — Vector search returns irrelevant documents."
    **Symptoms:** answers cite off-topic sources; users complain of nonsense.
    **Investigate:** log **top-k with scores** for failing queries; is the right doc
    absent (recall) or just ranked low (precision)?
    **Telemetry:** recall@k, score distributions, embedding model/version, filter
    usage.
    **Root cause:** wrong/changed embedding model, bad chunking, missing metadata
    filters, or pure-vector missing exact terms (needs hybrid).
    **Mitigate:** roll back a recent retrieval change; add a keyword/hybrid fallback.
    **Permanent fix:** hybrid (vector + keyword) + **reranker**; fix chunking;
    metadata filters; consistent embedding model.
    **Prevention:** retrieval eval (recall@k / MRR) gating changes.
    **Follow-ups:** "recall vs precision fix differ how?" → recall = get the doc
    into top-k (hybrid/chunking); precision = reorder (reranker).

??? question "Incident 8 — The agent enters an infinite loop."
    **Symptoms:** a task never finishes; steps/cost climb until a cap or timeout.
    **Investigate:** trace the run; look for the **same action repeating**.
    **Telemetry:** steps-per-task, repeated-action signature, tool-failure rate.
    **Root cause:** no/soft step cap; a tool keeps failing so the agent retries
    forever; goal drift; ambiguous tool results.
    **Mitigate:** enforce a hard **step cap** + cost budget + timeout; kill the
    run.
    **Permanent fix:** repeated-action detection, clear tool success/failure
    signals, bounded re-planning, deterministic fallback when stuck.
    **Prevention:** these bounds are runtime controls you **monitor and alert on**,
    not afterthoughts.
    **Follow-ups:** "why not just raise the cap?" → treats the symptom; fix the
    failing tool / add loop detection.

??? question "Incident 9 — Deploy passes functional tests but fails AI evaluation."
    **Symptoms:** CI unit/integration green, but the **eval gate** blocks (or worse,
    quality dropped in prod because there was no gate).
    **Investigate:** compare golden + **regression** eval vs the current prod
    version; which dimension regressed (correctness, faithfulness, format)?
    **Telemetry:** per-dimension eval scores, diff vs prod baseline.
    **Root cause:** a prompt/model/retrieval change shifted quality even though code
    behavior didn't change — exactly what functional tests can't see.
    **Mitigate:** don't ship; keep the current prod version.
    **Permanent fix:** adjust the prompt/model/retrieval so it meets the bar;
    re-run eval.
    **Prevention:** **golden + regression eval as a required CI gate** (this
    incident is the argument for it); canary + rollback on quality regression.
    **Follow-ups:** "why regression on top of golden?" → absolute scores can look
    fine while you've quietly gotten worse than prod.

??? question "Incident 10 — One external model provider becomes unavailable."
    **Symptoms:** 5xx/timeout spike from the provider; error rate up, latency up as
    calls hang.
    **Investigate:** confirm it's the provider (status + error signature), not your
    stack.
    **Telemetry:** provider error rate, timeout count, circuit-breaker state,
    fallback hit rate.
    **Root cause:** provider outage / regional degradation.
    **Mitigate:** **timeouts** stop the hangs; the **circuit breaker** opens so you
    fail fast; **fall back** to an alternate provider/region or a cheaper model, or
    a cached/extractive answer marked degraded.
    **Permanent fix:** multi-provider/region config with automatic failover;
    backoff+jitter on retries so you don't re-flood on recovery.
    **Prevention:** a **tested** failover path (game-day/chaos test), provider health
    checks, SLO + alert.
    **Follow-ups:** "why jitter on retries?" → avoid a thundering herd re-DDoSing the
    recovering provider.

---

## The incident-response checklist (say this structure)

- [ ] **Detect** — what alerted you (or should have)?
- [ ] **Mitigate first** — rollback / fallback / kill switch to restore service
- [ ] **Investigate** — traces + telemetry; correlate with the change window
- [ ] **Root cause** — the actual mechanism, not the symptom
- [ ] **Permanent fix** — so it can't recur
- [ ] **Prevention** — the CI gate / alert / control that catches it next time
- [ ] **Blameless postmortem** — fix the system, not the person

!!! note "Related"
    [Reliability & Distributed Systems](../GenAI-Topics/reliability/index.md) ·
    [Observability & Eval](../GenAI-Topics/observability/index.md) ·
    [AI Security](../AI-Security/index.md) ·
    [LLMOps / Production CI-CD](../GenAI-Topics/llmops/index.md) ·
    Practice: [Scenario Drills](Lab_Scenario_Drills.md) ·
    [DevOps Interview Q&A](DevOps_Interview_QA.md)
