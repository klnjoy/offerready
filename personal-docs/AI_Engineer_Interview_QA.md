---
icon: material/brain
---

# AI Engineer Interview Q&A — Advanced & Scenario-Based

*Last reviewed: October 2026*

Senior GenAI / AI-engineering questions: RAG design, agents, evaluation,
guardrails, cost/latency, and productionizing LLM systems. Study at a glance,
then open each question for depth.

!!! tip "How to use this page"
    Skim the **60-second talking points** and **rapid-fire** for recall, then
    drill into the collapsible questions. Finish with the **self-quiz**.
    Deep dives: [RAG](../GenAI-Topics/rag/index.md) ·
    [Agent Engineering](../GenAI-Topics/agent-engineering/index.md) ·
    [Observability & Eval](../GenAI-Topics/observability/index.md).

---

## Study checklist

Can you explain each without notes?

- [ ] RAG vs fine-tuning — when each wins, and why
- [ ] The full retrieval pipeline (chunk → embed → search → rerank → ground)
- [ ] How to diagnose and fix poor retrieval quality
- [ ] When an agent is warranted vs a fixed chain
- [ ] The plan → act → observe loop and its guardrails
- [ ] How to build and use an eval set (retrieval + answer metrics)
- [ ] LLM-as-judge and its biases
- [ ] Prompt injection and defenses
- [ ] Cost/latency levers (routing, caching, context trimming)
- [ ] Deploying + monitoring for quality drift

---

## 60-second talking points

- **"Ground the model, don't trust its memory."** Retrieval + context beats
  fine-tuning for factual, changing knowledge, and gives provenance.
- **"Evaluate before you tune."** A labeled eval set turns prompt/model changes
  from vibes into measured decisions.
- **"Determinism and structure where correctness matters."** Low temperature
  (where the model supports it), schema-constrained structured output, and
  validation for anything auditable.

---

## Core concepts — simple, then the nuance

??? note "RAG: explain it simply, then go deep"
    **Simple:** Instead of hoping the model *remembers* a fact, you *look it up*
    from your data and paste the relevant text into the prompt, then ask the model
    to answer from that.

    **The nuance:** Quality is a pipeline, not a single knob — chunking, embedding
    model, retrieval (vector + keyword hybrid), reranking, and context assembly
    within a token budget each affect the answer. The model should be instructed to
    answer *only* from context and cite sources. RAG keeps knowledge fresh (update
    the index, not the weights) and auditable (citations), which is why it beats
    fine-tuning for facts.

??? note "Agents: simple, then deep"
    **Simple:** An agent is an LLM in a loop that can *use tools* and *decide the
    next step* based on what it sees, instead of following fixed instructions.

    **The nuance:** The loop is **plan → act → observe**, repeated until done or a
    step cap. It needs narrow well-described tools (typed, least-privilege), a way
    to stop runaway loops, guardrails on inputs/outputs, human approval for
    destructive actions, and tracing. Agents add latency, cost, and failure surface
    — only use them when the path genuinely can't be predetermined.

---

## RAG

=== "Retrieve → ground → answer"

    ```text
    query → embed → vector/hybrid search (top-k)
          → rerank → assemble context (within token budget)
          → prompt with citations → answer + sources
    ```

=== "Grounded prompt shape"

    ```text
    System: Answer ONLY from the provided context. If it's not in the context,
    say "not found in the provided sources". Cite chunk ids you used.
    Context: {retrieved_chunks}
    Question: {user_question}
    Return JSON: {"answer": "...", "citations": ["c12","c3"]}
    ```

=== "Chunking sketch"

    ```python
    # Prefer semantic boundaries; overlap preserves context across splits
    def chunk(text, size=800, overlap=120):
        words = text.split()
        step = size - overlap
        return [" ".join(words[i:i+size]) for i in range(0, len(words), step)]
    ```

!!! example "Worked scenario: 'the bot cites the wrong policy'"
    **Symptom:** A support RAG bot answers confidently but quotes the wrong policy.

    **Reasoning:**
    1. **Is the right chunk even retrieved?** Log top-k for the failing query. If
       the correct passage isn't in top-k → retrieval problem.
    2. **Fix retrieval:** better chunking (align to policy sections), hybrid search
       so exact policy numbers aren't lost, add a **reranker**, add metadata
       filters (policy type/date).
    3. **If the right chunk is present but ignored:** tighten the prompt to answer
       only from context, lower temperature, require citations and validate them.
    4. **Measure:** run a retrieval eval (recall@k) + answer faithfulness on a
       labeled set to confirm the fix.

    **Outcome:** "Most 'hallucination' bugs are actually retrieval bugs — I'd fix
    recall first, then grounding."

??? question "RAG vs fine-tuning — when do you pick which?"
    **RAG** for factual, frequently-changing, or large knowledge you must cite and
    keep current — you update the index, not the model. **Fine-tuning** for teaching
    *behavior/format/style* or a narrow skill, not for injecting facts. Often
    combined: fine-tune tone/format, RAG for facts. RAG is cheaper to keep fresh and
    gives provenance.

??? question "Retrieval returns irrelevant chunks. How do you fix quality?"
    Work the pipeline end to end: fix **chunking** (semantic units, sensible
    overlap); use a better **embedding model**; switch to **hybrid** (vector +
    keyword) so exact terms aren't lost; add a **reranker** to reorder top-k; add
    **metadata filters** to scope search. Measure with a retrieval eval set (hit
    rate / MRR / recall@k) so you know which change helped.

??? question "How do you choose chunk size and overlap?"
    Chunk to **semantic units** (paragraphs/sections) where possible; typical ranges
    are a few hundred tokens with modest overlap so context isn't cut mid-thought.
    Too large → diluted relevance and wasted budget; too small → lost context and
    more chunks. Tune empirically against your eval set.

??? question "The answer is grounded but the model still hallucinates a detail. Why?"
    It's filling gaps from parametric memory. Mitigate: instruct it to answer
    **only** from context and say "not found" otherwise; lower temperature; require
    **citations** tied to retrieved chunks and validate them; tighten retrieval so
    the fact is actually present. If context lacks it, the fix is retrieval, not
    prompting.

??? question "Vector search vs hybrid vs keyword — trade-offs?"
    Pure **vector** captures semantic similarity but can miss exact tokens (IDs,
    codes, rare terms). **Keyword** (BM25) nails exact matches but misses paraphrase.
    **Hybrid** combines both scores for the best recall in practice. Add a
    **reranker** on top of hybrid candidates for precision.

---

## Agents

??? question "When do you actually need an agent vs a fixed pipeline?"
    Use a **fixed pipeline** when steps are known and stable (cheaper, reliable,
    testable). Use an **agent** when the task is open-ended and the path depends on
    intermediate results — the model must plan, choose tools, and iterate. Agents
    add latency, cost, and failure modes; don't reach for them when a deterministic
    chain works.

??? question "Design a reliable tool-using agent."
    Narrow, well-described tools (typed schemas, least privilege, read vs write
    separated); a **plan → act → observe** loop with a step cap to prevent runaway
    loops; **grounding** (tools return real data); **guardrails** on inputs and
    outputs; **human-in-the-loop** for destructive actions; and full **tracing** of
    every step. Treat tool output as untrusted (injection).

??? question "Single agent vs multi-agent (supervisor)?"
    Start single-agent — simpler and often enough. Move to **supervisor +
    specialists** when domains are genuinely distinct (different tools/context per
    domain) and a router improves reliability. Multi-agent adds coordination cost
    and failure surface, so justify it with real separation of concerns.

??? question "How do you stop an agent from looping forever or burning budget?"
    Hard **step/iteration cap**, a **token/cost budget** per task, timeouts, and a
    termination condition the model must produce (explicit "final answer"). Detect
    repeated identical tool calls and break. Trace every step so you can see where
    loops form and tighten the prompt or tool set.

---

## Evaluation & guardrails

=== "Structured, deterministic output"

    ```text
    System: Answer ONLY from context. If missing, return NA.
    Return JSON only: {"answer": "...", "citations": ["chunk_id", ...]}
    temperature = 0.0   # if supported; many reasoning models ignore or reject it
    # Prefer the provider's structured-output / JSON-schema mode over "JSON only" prose
    ```

=== "Eval dimensions"

    ```text
    Retrieval:  recall@k, MRR, hit-rate
    Answer:     correctness/faithfulness (exact-match or LLM-judge rubric)
    Format:     valid JSON / schema pass rate
    Ops:        latency p50/p95, cost per request
    ```

??? question "How do you evaluate an LLM feature before shipping a change?"
    Build a **labeled eval set** of representative inputs with expected outputs or
    rubrics. Measure per dimension: retrieval quality (recall@k/MRR), answer
    correctness/faithfulness (exact match or **LLM-as-judge** with a rubric), format
    validity, latency, and cost. Run it on every prompt/model change so you ship on
    evidence. Pin model versions; re-run before upgrading.

??? question "LLM-as-judge — how do you keep it trustworthy?"
    Use a clear rubric and structured scores, calibrate the judge against a
    human-labeled subset, watch for known biases (position, verbosity,
    self-preference), and use a strong judge model at low temperature. Treat it as a
    scalable approximation of human eval, spot-checked by humans.

??? question "What guardrails go around a production LLM?"
    **Input** guardrails (block injection/unsafe requests, PII handling), **output**
    guardrails (validate schema, filter unsafe content, verify citations),
    **grounding** (answer only from context), and **operational** controls (rate
    limits, cost caps, timeouts, fallback responses). Human review for high-stakes
    actions. Log everything for audit.

---

## Cost, latency, production

??? question "Your LLM feature is too slow and too expensive. Levers?"
    **Model routing**: small/cheap model for easy cases, escalate hard ones.
    **Prompt caching** (provider-side): put stable content (system prompt, tool
    definitions, long documents) first so repeated prefixes bill at a discount and
    return faster. **Response caching**: exact + semantic caching of frequent
    queries. **Prompt trimming**: retrieve less, compress context, drop redundant
    history. **Batch APIs** for offline work (typically about half price).
    **Reasoning effort**: on reasoning models, lower the effort/thinking budget for
    easy requests, because reasoning tokens are billed as output. **Streaming** to cut
    *perceived* latency. Measure per-request cost/latency and optimize the top
    offenders.

??? question "Finance says LLM spend tripled this quarter. How do you get it under control without hurting quality?"
    1. **Attribute first:** tag every call with feature, tenant, model and
       prompt version; build a cost dashboard (input, cached input, output and
       reasoning tokens) and find the top offenders. Usually a few features or
       a runaway agent loop dominate.
    2. **Set unit economics:** cost per successful task or per resolved ticket,
       with budgets and alerts per feature and tenant.
    3. **Cut waste:** fix retry storms and loops (step caps, budgets), trim
       oversized context and tool catalogs, cap output length.
    4. **Cheaper paths:** prompt caching, route easy traffic to smaller models,
       batch offline jobs, lower reasoning effort where evals allow.
    5. **Protect quality:** gate every change on the eval set and compare cost
       *and* success rate; a cheaper model that fails more often costs more per
       success.
    6. **Guardrails:** per-user rate limits and quotas so abuse or a bug can't
       spike spend again.

??? question "How do you handle prompt injection in a RAG/agent system?"
    Treat all retrieved/tool content as **data, not instructions**; the system
    prompt should say to ignore embedded directives. Separate trusted instructions
    from untrusted context, validate/scope tool actions, gate writes with approval,
    and sanitize/pattern-check where feasible. Never let untrusted text trigger a
    privileged action directly.

??? question "How do you deploy and monitor an LLM app responsibly?"
    Version prompts and models; roll out changes behind flags/canary with the eval
    set as a gate; monitor **quality drift** (sampled evals in prod), latency, cost,
    and error rates; capture user feedback (thumbs up/down); keep a fast rollback.
    Re-run the eval set before any model upgrade to catch silent regressions.

??? question "What is context engineering and why does it matter?"
    Deliberately managing what goes into the context window — instructions,
    retrieved facts, memory, tool results — within a token budget. It matters
    because tokens cost money and latency, and irrelevant context *degrades* answer
    quality (distraction, lost-in-the-middle). Good context engineering retrieves
    only what's needed, compresses history, and orders content for the model.

---

## Rapid-fire

| Q | A |
|---|---|
| RAG vs fine-tune? | RAG = facts/fresh/cited; fine-tune = behavior/format/style |
| Hybrid search? | vector + keyword combined for better recall |
| Reranker role? | reorders top-k for relevance before context assembly |
| Temperature for auditing? | low/0 where supported — more repeatable, not guaranteed deterministic |
| Prompt caching? | stable prefix reused across calls → cheaper, faster input |
| LLM-as-judge? | model scores outputs against a rubric, human-calibrated |
| Semantic cache? | reuse answers for similar (not just identical) queries |
| Agent step cap? | prevents runaway plan→act loops |
| Biggest agent risk? | prompt injection via tool/retrieved content |
| recall@k measures? | fraction of relevant chunks in top-k retrieved |
| Lost-in-the-middle? | models weight start/end of long context over the middle |

---

## Pitfalls interviewers probe

- Fine-tuning to inject facts (use RAG).
- Shipping prompt/model changes with no eval set.
- Trusting retrieved/tool content as instructions (injection).
- Reaching for multi-agent when a fixed chain works.
- Ignoring token budget → cost/latency blowups.
- No versioning/rollback → silent quality drift on model upgrades.
- Calling every wrong answer a "hallucination" when it's a retrieval miss.

---

## Self-quiz

1. Given a RAG bot that cites wrong sources, how do you find the root cause?
2. When is fine-tuning the right tool, and when is it the wrong one?
3. Justify (or reject) using a multi-agent design for a task.
4. What metrics gate an LLM change before it ships?
5. How do you defend an agent against prompt injection?
6. Name four levers to cut LLM cost/latency.
7. Why can adding more context *reduce* answer quality?
8. How do you catch quality drift after a model upgrade?
9. Why is cost per successful task a better metric than cost per call?

!!! note "Cross-links"
    Deep dives: [RAG](../GenAI-Topics/rag/index.md) ·
    [Agent Engineering](../GenAI-Topics/agent-engineering/index.md) ·
    [Observability & Eval](../GenAI-Topics/observability/index.md) ·
    [MCP Interview Q&A](MCP_Interview_QA.md)
