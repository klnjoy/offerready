---
icon: material/server-network
---

# AI Platform Engineer Role Guide

*Last reviewed: October 2026*

A role guide for **AI Platform Engineer** interviews, also titled ML platform
engineer, LLM infrastructure engineer or GenAI platform engineer. In these roles
you build the shared layer that every AI team in the company builds on: model
access, serving, evaluation, observability, guardrails and cost control. This
page covers the role, the usual loop, the rubric, the likely questions, and a
14-day plan. It links to the study pages rather than repeating them.

!!! abstract "What this role is really testing"
    **Can you run AI as a reliable, multi-tenant, cost-controlled service for
    other engineers?** Distributed-systems fundamentals, Kubernetes and GPU
    capacity, an LLM gateway with quotas and fallbacks, observability that
    understands tokens and model calls, and a platform people actually adopt.
    Depth in infrastructure beats breadth in prompting here.

    Looking for warehouses, ELT and data governance instead? See the
    [Data Platform Engineer guide](Path_Data_Platform.md).

---

## What the role is in 2026

Once a company has more than a handful of LLM features, the same problems repeat
in every team: API keys in code, no shared rate limits, surprise bills, no way to
switch models, traces that stop at the model call, and evals that live in one
person's notebook. The AI platform team exists to solve those once. Typical
scope:

- **Model access:** an LLM gateway in front of hosted and self-hosted models,
  with auth, per-team quotas, routing, fallbacks, caching and cost attribution.
- **Self-hosted serving:** open-weight models on GPUs, using inference engines
  such as vLLM (a PyTorch Foundation hosted project since May 2025,
  [PyTorch Foundation](https://pytorch.org/blog/pytorch-foundation-welcomes-vllm/))
  or SGLang, often on Kubernetes. The Kubernetes
  [Gateway API Inference Extension](https://gateway-api-inference-extension.sigs.k8s.io/)
  adds model-aware routing to gateways, and
  [llm-d](https://llm-d.ai/), a CNCF Sandbox project, packages distributed
  inference features such as prefill/decode disaggregation and prefix-cache-aware
  routing.
- **Evaluation and observability:** a shared eval harness, release gates, and
  traces for model and tool calls. OpenTelemetry's GenAI semantic conventions now
  live in their own repository
  ([open-telemetry/semantic-conventions-genai](https://github.com/open-telemetry/semantic-conventions-genai))
  and were still marked "Development" in mid-2026, so expect attribute names to
  change.
- **Safety and governance:** guardrails, PII handling, audit logs, model and
  prompt registries, and the policy for which data may go to which provider.
- **Agent infrastructure:** tool registries, MCP servers, sandboxes and
  identity for agents.

Tools move quickly in this space. Interviewers care more about *why* you would
put a gateway, a queue or a cache in a given place than about any product name.

| | AI platform engineer | AI engineer | ML engineer / MLOps | Data platform engineer |
|---|---|---|---|---|
| **Builds** | Shared AI infrastructure: gateway, serving, evals, observability | LLM features for one product | Training pipelines, feature stores, model deployment | Warehouses, ELT, governance |
| **Customers** | Internal engineering teams | End users | Data scientists, product teams | Analysts, data and AI teams |
| **Core skills** | Kubernetes, GPUs, distributed systems, SRE, API design | RAG, agents, prompts, evals | Training, experiment tracking, model registries | SQL, modelling, Spark, dbt |
| **Judged on** | Uptime, latency, cost per request, adoption | Feature quality and cost | Model quality and deployment speed | Data quality, freshness, cost |
| **Typical design question** | "Design an LLM gateway for 40 teams" | "Design a support assistant" | "Design a training and retraining pipeline" | "Design a CDC pipeline into the warehouse" |
| **Guide** | This page | [AI Engineer guide](Path_AI_Engineer.md) | [LLMOps](../GenAI-Topics/llmops/index.md) | [Data Platform guide](Path_Data_Platform.md) |

---

## The interview loop by company type

These are **common patterns**, not a description of any one company's current
process. Ask the recruiter for the round list and whether there is an
infrastructure-specific design round.

### Frontier lab or model provider

| Round | What it tests | Length |
|---|---|---|
| Recruiter + hiring manager | Scale of systems you have run, on-call history | 30 min each |
| Coding (practical or systems) | Concurrency, rate limiters, schedulers, parsing logs; production-quality code | 60 min |
| Infrastructure system design | Serving or gateway design at very large scale, GPU capacity, failure handling | 60 min |
| Performance / debugging deep dive | Latency breakdown, batching, memory, profiling | 45–60 min |
| Project deep dive | One platform you built or ran | 45–60 min |
| Values / behavioural | Ownership, incidents, safety mindset | 45 min |

Expect questions on inference efficiency (batching, KV cache, throughput versus
latency) and on capacity planning under scarce GPUs.

### Big tech

A standard infrastructure loop: two coding rounds, one or two system design
rounds (one of which may be "design model serving" or "design an internal LLM
API"), and behavioural rounds. Distributed-systems fundamentals carry most of the
signal. Four to five rounds on the onsite is typical.

### AI-native startup

Small teams, so the platform engineer is often also the SRE and the person who
picks the inference stack. Expect a practical exercise (deploy a model server,
add autoscaling and metrics, or debug a slow endpoint), a design conversation
about scaling the current system, and founder rounds. Often one to two weeks.

### Enterprise or consulting

The focus shifts to governance and integration: a reference architecture for an
enterprise AI platform on one cloud, landing zones, private networking, identity,
data residency, approved-model catalogues and chargeback. Expect a presentation
and questions from security and architecture reviewers.

---

## Scoring rubric: what "strong hire" sounds like

| Round | Strong hire at senior | Strong hire at staff |
|---|---|---|
| **Coding** | Correct, concurrent-safe code (for example a token-bucket rate limiter) with tests | Same, plus clean interfaces, back-pressure, and metrics built in |
| **Infrastructure design** | Sensible components (gateway, queue, model pool, cache, store); handles provider outage with fallbacks | Starts from SLOs and tenants; capacity and cost model; isolation between tenants; rollout and migration path; explains what they would *not* build |
| **Performance deep dive** | Breaks latency into queueing, prefill, decode and network; knows batching and caching levers | Reasons about throughput vs latency trade-offs with numbers, and how to measure before tuning |
| **Reliability / incident** | Diagnose, mitigate, prevent; uses dashboards and traces | Designs the alert that would have caught it, and removes the class of failure |
| **Platform adoption** | Clear API and docs; a paved path for the common case | A product mindset: measures adoption, deprecates safely, and says no to one-off requests with a reason |
| **Behavioural** | On-call and incident stories with their own actions | Stories of setting standards across teams and changing an org's direction |

---

## The 20 questions you are most likely to get

### Coding

1. Implement a per-tenant token-bucket rate limiter that counts tokens, not
   requests. → [Reliability](../GenAI-Topics/reliability/index.md) ·
   [Python Q&A](Python_Interview_QA.md)
2. Write a client wrapper with retries, jittered back-off, timeouts and a
   circuit breaker for a model API. →
   [Reliability](../GenAI-Topics/reliability/index.md)
3. Parse request logs and report p50/p95 latency and cost per team. →
   [Live-Coding Drills](Lab_LiveCoding_Drills.md)

### Infrastructure system design

4. Design an internal LLM gateway for 40 teams: auth, quotas, routing,
   fallbacks, cost attribution. → [LLMOps](../GenAI-Topics/llmops/index.md) ·
   [Cost Optimization](../GenAI-Topics/cost-optimization/index.md)
5. Design self-hosted serving for an open-weight model with spiky traffic. →
   [Kubernetes & Containers](../GenAI-Topics/kubernetes/index.md)
6. When would you self-host instead of using a hosted API? Walk through the cost
   model. → [Cost Optimization](../GenAI-Topics/cost-optimization/index.md)
7. Design a shared evaluation service that gates every model or prompt release.
   → [Observability & Eval](../GenAI-Topics/observability/index.md)
8. Design tracing for a multi-step agent across services. →
   [Monitoring & Observability](../Enterprise/monitoring/index.md)
9. Design a platform for teams to run agents with tools safely: identity,
   sandboxing, audit. → [AgentCore](../GenAI-Topics/agentcore/index.md) ·
   [AgentCore Identity & Gateway](../AI-Security/agentcore-identity-gateway.md)
10. Design a semantic cache. When is it safe, and how do you invalidate it? →
    [Cost Optimization](../GenAI-Topics/cost-optimization/index.md)
11. How do you make tenants unable to see each other's prompts, data or logs? →
    [Security Architecture](../Enterprise/security-architecture/index.md) ·
    [RBAC Model](../Enterprise/rbac/index.md)

### Performance and capacity

12. Where does time go in an LLM request, and which levers reduce each part? →
    [LLM Fundamentals](../GenAI-Topics/llm-fundamentals/index.md)
13. How do you plan GPU capacity for next quarter? →
    [Kubernetes & Containers](../GenAI-Topics/kubernetes/index.md)
14. How would you autoscale a model server, and on which signal? →
    [DevOps for AI](../GenAI-Topics/devops-ai/index.md)

### Reliability and incidents

15. The main model provider is returning errors for 30% of requests. What
    happens in your platform, and what do you do? →
    [Production Incident Interviews](Interview_Production_Incidents.md)
16. The monthly AI bill doubled. Find out why and stop it happening again. →
    [Cost Optimization](../GenAI-Topics/cost-optimization/index.md)
17. Roll out a new model version to all teams without breaking them. →
    [LLMOps](../GenAI-Topics/llmops/index.md) ·
    [DevOps Q&A](DevOps_Interview_QA.md)

### Governance and behavioural

18. Which data may go to which model provider, and how is that enforced? →
    [Compliance](../Enterprise/compliance/index.md) ·
    [AI Security](../AI-Security/index.md)
19. Tell me about a platform you built that teams did not adopt. What did you
    change? → [Behavioral / STAR](Behavioral_STAR_Interview_QA.md)
20. Tell me about an incident you led. → [Behavioral / STAR](Behavioral_STAR_Interview_QA.md)

---

## Common failure modes

- **Rehearsed answers that collapse under follow-up.** "We put a gateway in
  front" sounds fine until the interviewer asks how quotas are counted for
  streaming responses, or what happens to in-flight requests when a fallback
  fires. Know the mechanism one level below every box you draw.
- **Product names instead of design.** Listing tools without explaining routing,
  state, failure handling and cost.
- **No numbers.** Platform design without requests per second, tokens per
  request, latency targets and a rough cost is not a platform design.
- **Building everything.** Proposing a custom serving stack when a hosted API
  meets the need. Staff candidates say what they would buy and why.
- **Forgetting the users.** A platform no team adopts has failed. Talk about the
  paved path, docs, migration and support.
- **Security as an afterthought.** Tenant isolation, key management, audit logs
  and data policy belong in the first diagram.
- **Treating LLMs like normal web requests.** Long and variable latency,
  streaming, token-based cost and non-deterministic output change rate limiting,
  timeouts, caching and testing.

---

## The skills this guide builds

| Skill | Why it matters | Where you build it |
|-------|----------------|--------------------|
| **Distributed-systems reliability** | Retries, circuit breakers, idempotency, SLOs | [Reliability](../GenAI-Topics/reliability/index.md) |
| **Kubernetes and serving** | Running models and gateways at scale | [Kubernetes & Containers](../GenAI-Topics/kubernetes/index.md) · [LLMOps](../GenAI-Topics/llmops/index.md) |
| **Cost control** | Routing, caching, quotas, chargeback | [Cost Optimization](../GenAI-Topics/cost-optimization/index.md) |
| **Observability and evals** | Traces, metrics, release gates | [Observability & Eval](../GenAI-Topics/observability/index.md) · [Monitoring](../Enterprise/monitoring/index.md) |
| **Security and governance** | Isolation, identity, policy, audit | [AI Security](../AI-Security/index.md) · [Enterprise](../Enterprise/index.md) |

---

## 14-day plan

| Day | Focus | Do |
|---|---|---|
| 1 | Baseline | Add the job in OfferReady. Answer questions 4, 12 and 15 out loud; note the gaps. |
| 2 | Fundamentals | [LLM Fundamentals](../GenAI-Topics/llm-fundamentals/index.md) from a serving view: tokens, context, prefill vs decode, batching. |
| 3 | Reliability | [Reliability & Distributed Systems](../GenAI-Topics/reliability/index.md): timeouts, retries, circuit breakers, idempotency, SLOs. |
| 4 | Coding | Questions 1–3, timed, 45 minutes each. |
| 5 | Kubernetes | [Kubernetes & Containers](../GenAI-Topics/kubernetes/index.md) and [DevOps for AI](../GenAI-Topics/devops-ai/index.md): autoscaling, GPU nodes, rollouts. |
| 6 | Gateway design | Question 4 end to end on a whiteboard, with numbers. Then [LLMOps](../GenAI-Topics/llmops/index.md). |
| 7 | Mock 1 | Voice mock with an infrastructure design round. List every follow-up you could not answer. |
| 8 | Cost | [Cost Optimization](../GenAI-Topics/cost-optimization/index.md): build a self-host vs hosted cost model (question 6). |
| 9 | Observability & evals | [Observability & Eval](../GenAI-Topics/observability/index.md) and [Monitoring](../Enterprise/monitoring/index.md): design questions 7 and 8. |
| 10 | Security | [AI Security](../AI-Security/index.md), [Security Architecture](../Enterprise/security-architecture/index.md), [RBAC](../Enterprise/rbac/index.md): tenant isolation and data policy. |
| 11 | Agent infrastructure | [AgentCore](../GenAI-Topics/agentcore/index.md), [MCP](../GenAI-Topics/mcp/index.md), [AgentCore Identity & Gateway](../AI-Security/agentcore-identity-gateway.md): question 9. |
| 12 | Incidents | Questions 15–17 as diagnose, mitigate, prevent, using [Production Incidents](Interview_Production_Incidents.md). |
| 13 | Mock 2 | Voice mock with Deep follow-ups on. Then two STAR stories (adoption, incident). |
| 14 | Light review | [Cheat Sheets](Interview_Cheat_Sheets.md), [DevOps Q&A](DevOps_Interview_QA.md), [AWS Q&A](AWS_Interview_QA.md), rest. |

---

## Are you ready? (self-check)

- [ ] I can design an LLM gateway with quotas, routing, fallbacks and cost attribution, with numbers.
- [ ] I can explain where latency goes in an LLM request and which levers reduce it.
- [ ] I can make the self-host vs hosted API decision with a cost model.
- [ ] I can design tenant isolation, key management and audit for a shared AI platform.
- [ ] I can design eval release gates and tracing that other teams will use.
- [ ] I can run a provider outage or cost spike as diagnose → mitigate → prevent.
- [ ] I can explain how I would get teams to adopt the platform.

---

## Practise this in OfferReady

[:material-briefcase-plus: Add a job](https://klnjoy.github.io/offerready-app/analyze){ .md-button .md-button--primary target=_blank rel=noopener }
[:material-microphone: Voice mock](https://klnjoy.github.io/offerready-app/interview/voice){ .md-button target=_blank rel=noopener }
[:material-dumbbell: Practice questions](https://klnjoy.github.io/offerready-app/practice){ .md-button target=_blank rel=noopener }

- **Add a job** reads the platform job description and builds a plan around
  your gaps.
- **Voice mock** runs a spoken interview. Turn on **Deep follow-ups** for the
  "and then what?" questions, and use the **whiteboard** in the system-design
  round to draw the gateway and serving path as you explain it.
- **Practice** gives you scored questions for this role, one at a time.

## Sources

- PyTorch Foundation, [*PyTorch Foundation welcomes vLLM*](https://pytorch.org/blog/pytorch-foundation-welcomes-vllm/) (May 2025).
- Kubernetes SIG Network, [Gateway API Inference Extension](https://gateway-api-inference-extension.sigs.k8s.io/).
- [llm-d project site](https://llm-d.ai/) (CNCF Sandbox status and feature list).
- OpenTelemetry, [semantic-conventions-genai](https://github.com/open-telemetry/semantic-conventions-genai) repository; status summary from [Azena AI on DEV, July 2026](https://dev.to/azena-ai/opentelemetrys-genai-semantic-conventions-are-not-stable-yet-heres-what-actually-shipped-in-2026-3mke).

!!! note "Related role guides"
    [AI Engineer](Path_AI_Engineer.md) ·
    [Forward Deployed Engineer](Path_FDE.md) ·
    [Data Platform Engineer](Path_Data_Platform.md) ·
    [Staff / Principal AI Architect](Path_Staff_Principal_Architect.md) ·
    [Interview Guide overview](Interview_Guide_Overview.md)
