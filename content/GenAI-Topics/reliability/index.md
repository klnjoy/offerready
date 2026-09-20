---
icon: material/shield-refresh
---

# Reliability & Distributed Systems

An AI system is a distributed system with an unusually flaky dependency (the
model/tool layer) bolted on. This page covers the reliability patterns every
senior engineer must apply, then the **AI-specific failure modes** and how each
pattern contains them.

!!! abstract "The core assumption"
    Every remote call **will** fail, time out, or return garbage eventually —
    model providers, tools, vector DBs, MCP servers. Reliability is designing so
    that a dependency failure degrades gracefully instead of cascading.

---

## The reliability toolkit

| Pattern | Problem it solves | AI-system use |
|---------|-------------------|---------------|
| **Timeout** | A slow call blocks forever | Cap every model/tool/retrieval call |
| **Retry + backoff + jitter** | Transient failures | Retry model/tool on 429/5xx, spread the load |
| **Circuit breaker** | A dead dependency wastes calls | Stop hammering a down model provider; fail fast |
| **Bulkhead** | One workload starves others | Isolate the agent pool from the ingestion pool |
| **Rate limiting** | Overload / cost abuse | Per-user/tenant caps on requests + tokens |
| **Idempotency** | Duplicate side effects on retry | Keyed writes so a retried tool call doesn't double-act |
| **Queue + DLQ** | Bursty load, poison messages | Async work; dead-letter the un-processable |
| **Backpressure** | Producers outrun consumers | Bound queues; shed/slow load instead of OOM |
| **Fallback / graceful degradation** | Dependency down | Cheaper model, cached answer, or extractive reply |

### Retry with backoff + jitter (the one people get wrong)

Naive retries make an outage *worse* (thundering herd). Exponential backoff **with
jitter** spreads retries so a recovering provider isn't re-flooded.

```python
import random, time

def call_with_retry(fn, attempts=4, base=0.5, cap=8.0):
    for i in range(attempts):
        try:
            return fn()
        except Transient as e:          # only retry transient (429/5xx/timeout)
            if i == attempts - 1:
                raise
            sleep = min(cap, base * 2 ** i)      # exponential
            sleep = random.uniform(0, sleep)     # full jitter — key part
            time.sleep(sleep)
```

- **Only retry transient errors** (429, 5xx, timeouts) — never a 400/validation
  error (it'll fail identically).
- **Jitter is not optional** — without it, all clients retry in lockstep and
  re-DDoS the recovering service.
- **Cap attempts + total time** so a retry storm can't blow your latency budget.

### Circuit breaker

After N consecutive failures, "open" the circuit: fail fast (or go straight to
fallback) for a cooldown, then let one trial request "half-open" test recovery.
Stops you burning latency/cost calling a provider that's clearly down.

### Idempotency (critical once agents take actions)

```python
# A retried "create ticket" must not create two tickets.
def create_ticket(idempotency_key, payload):
    if store.exists(idempotency_key):        # already done → return prior result
        return store.get(idempotency_key)
    result = ticketing.create(payload)
    store.put(idempotency_key, result)
    return result
```

Any tool with a side effect needs an idempotency key so retries/replays are safe.

---

## AI-specific failure scenarios

Each maps to patterns above. This table is a favorite interview probe.

| Failure | Symptom | Containment |
|---------|---------|-------------|
| **Model provider unavailable** | 5xx/timeout spike, errors | Circuit breaker → **fallback model** or cached/degraded answer |
| **Model provider rate-limited** | 429s | Backoff+jitter, per-tenant rate limit, request queue |
| **Tool/MCP server down** | Tool call errors | Timeout + retry; agent proceeds with reduced tools or asks for human |
| **Vector DB unavailable** | Retrieval empty/errors | Fallback to keyword/cache; answer "can't retrieve now" — don't hallucinate |
| **Malformed tool/model output** | Parse/schema failure | Validate → one repair retry → fail loud; never `eval` it |
| **Infinite agent loop** | Steps climb, cost spikes | Step cap + repeated-action detection (bounded autonomy) |
| **Context overflow** | Prompt exceeds window | Compact/summarize; truncate oldest; retrieve less |
| **Partial multi-tool failure** | 1 of N tools fails | Decide: proceed with partial, retry the one, or abort — don't silently drop |
| **Provider latency spike** | p95 doubles | Timeout + fallback; parallelize independent calls; stream |
| **Cost runaway** | Spend alarm | Token/cost budget per task, cap loops, alert + kill switch |

!!! example "Worked scenario: one model provider goes down at peak"
    **Symptom:** error rate jumps, latency climbs as calls hang.
    **Contain:** timeouts stop the hangs; the **circuit breaker** opens after N
    failures so you fail fast instead of queueing; requests **fall back** to an
    alternate provider/region or a cheaper model; if none, return a cached or
    extractive answer with a "degraded" notice. **Prevent recurrence:** multi-
    provider config, health checks, and a load test that exercises the failover.

---

## Distributed-systems fundamentals (the "why")

- **Everything is best-effort over an unreliable network** — assume reordering,
  duplication, and partial failure.
- **At-least-once vs exactly-once** — most delivery is at-least-once, so your
  **sink must be idempotent** to get effective exactly-once.
- **Eventual consistency** — a freshly written record may not be visible
  immediately (e.g. a just-indexed doc). Design for it; don't assume read-your-write.
- **Backpressure over buffering** — unbounded queues just move the OOM downstream;
  bound them and shed/slow load.
- **Bulkheads** — isolate resource pools so one runaway workload (a stuck agent
  loop) can't starve the rest.

---

## Interview deep dive

### 60-second talking points

- **"Every remote call fails eventually — timeout, retry with backoff+jitter,
  circuit-break, and fall back."**
- **"Idempotency is what makes retries and agent actions safe."**
- **"Degrade gracefully: a cached/extractive answer beats an error or a hang."**

??? question "A model provider becomes unavailable in production. What happens to your system?"
    Timeouts stop calls from hanging; a **circuit breaker** opens after repeated
    failures so you fail fast; requests **fall back** to an alternate provider/
    region or a cheaper model, or return a cached/extractive answer marked
    degraded. Backoff+jitter on retries avoids re-flooding it on recovery. Prevent:
    multi-provider config + a tested failover path.

??? question "Why is exponential backoff not enough without jitter?"
    Without jitter, every client backs off on the *same* schedule and retries in
    lockstep, re-DDoSing the recovering service (thundering herd). **Full jitter**
    randomizes each client's delay so load spreads out and the service can recover.

??? question "How do you make an agent's tool actions safe to retry?"
    **Idempotency keys**: each side-effecting tool call carries a key; the tool
    checks if that key was already processed and returns the prior result instead
    of acting twice. Combined with timeouts + bounded retries, a retried or
    replayed "create/refund/update" won't double-act.

??? question "Your agent occasionally hangs and burns cost. Which patterns apply?"
    **Bounded autonomy** (step cap + repeated-action detection) stops loops;
    **timeouts** stop a hanging tool/model call; a **cost budget** per task caps
    spend; **bulkheads** keep the stuck workload from starving others; a **kill
    switch** + alert lets ops intervene.

??? question "Retrieval (vector DB) is down. What should the agent do?"
    Fail gracefully, not falsely. Timeout the call; fall back to keyword search or
    a cache if available; otherwise answer "I can't retrieve the sources right now"
    rather than **hallucinating** from memory. Log it; it's a dependency incident.

### Pitfalls interviewers probe

- Retrying non-transient errors (400/validation) — wastes calls, same failure.
- Exponential backoff **without jitter** (thundering herd).
- No timeouts → hung calls exhaust the pool.
- Side-effecting tools with no idempotency → duplicate actions on retry.
- Unbounded queues instead of backpressure → OOM moved downstream.
- Hallucinating when retrieval fails instead of degrading honestly.

### Rapid-fire

| Q | A |
|---|---|
| Retry only when? | Transient errors (429/5xx/timeout) |
| Why jitter? | Prevents synchronized retry storms (thundering herd) |
| Circuit breaker? | Fail fast after N failures; test recovery via half-open |
| Idempotency? | Retried side-effect doesn't double-act (keyed) |
| Bulkhead? | Isolate resource pools so one can't starve others |
| Backpressure? | Bound queues; shed/slow load vs buffering to OOM |
| Provider down? | Circuit-break → fallback model / cached answer |
| Retrieval down? | Degrade honestly; never hallucinate |

!!! note "Related"
    [Agent Principles](../agent-principles/index.md) ·
    [LLMOps](../llmops/index.md) · [Observability & Eval](../observability/index.md) ·
    [Cost Optimization](../cost-optimization/index.md) · [AI Security](../../AI-Security/index.md) ·
    Practice: [Scenario Drills](../../Personal-SourceCode/Lab_Scenario_Drills.md) ·
    [DevOps Interview Q&A](../../Personal-SourceCode/DevOps_Interview_QA.md)
