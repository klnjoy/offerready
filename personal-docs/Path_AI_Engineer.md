---
icon: material/account-tie
---

# Path: AI / GenAI Engineer

A curated preparation path for **AI / GenAI Engineer** (Senior-level) interviews —
roles where you build and ship LLM applications. This page is your *plan*: what to
read, in what order, what to emphasize, and how to know you're ready. It routes
into existing pages rather than repeating them.

!!! abstract "What this level is really testing"
    **Can you build it well and debug it?** Technology depth, a correct design
    with the right primitives, real debugging instinct, and knowing the failure
    modes of the tools you use. Org-wide strategy and cost economics are *not*
    the focus yet — clean, working, tested engineering is.

    See [Senior / Staff / Principal / FDE](Interview_Level_Comparison.md) for what
    interviewers listen for at each level, and level up from here toward Staff.

---

## The 5 skills this path builds

| Skill | Why it matters at this level | Where you build it |
|-------|------------------------------|--------------------|
| **Solid RAG design** | The most common build; get chunking/retrieval/grounding right | [RAG](../GenAI-Topics/rag/index.md) · [Retrieval Tuning](../GenAI-Topics/retrieval-tuning/index.md) |
| **Reliable prompting & output** | Structured output, few-shot, guardrails | [Prompt Engineering](../GenAI-Topics/prompt-engineering/index.md) · [Context Engineering](../GenAI-Topics/context-engineering/index.md) |
| **A safe agent loop** | Bounded loops, gated tools, no runaway actions | [Agent Engineering](../GenAI-Topics/agent-engineering/index.md) · [Building Agents — Deep Dive](../GenAI-Topics/agent-principles/index.md) |
| **Evaluation & debugging** | Know *why* an answer is wrong; measure quality | [Observability & Eval](../GenAI-Topics/observability/index.md) |
| **Serving it as an API** | Ship the thing behind a real endpoint | [FastAPI](../Technologies/fastapi/index.md) |

---

## Study order (about 2 weeks)

Work top to bottom. Each step notes **what to emphasize**.

### Week 1 — Foundations & retrieval

1. **[LLM Fundamentals](../GenAI-Topics/llm-fundamentals/index.md)** — tokens,
   sampling, embeddings, context windows, RAG vs fine-tune. Be fluent.
2. **[Prompt Engineering](../GenAI-Topics/prompt-engineering/index.md)** +
   **[Context Engineering](../GenAI-Topics/context-engineering/index.md)** —
   reliable output, structured output, managing the context budget.
3. **[RAG](../GenAI-Topics/rag/index.md)** — chunking, embeddings, retrieval,
   grounding with citations. This is the core build.
4. **[Vector DB](../GenAI-Topics/vector-db/index.md)** +
   **[Embedding Models](../GenAI-Topics/embeddings/index.md)** — indexes
   (HNSW/IVF), similarity, choosing a model.
5. **[Retrieval Tuning](../GenAI-Topics/retrieval-tuning/index.md)** — top-K,
   filtering vs reranking; how you *improve* a mediocre RAG.

### Week 2 — Agents, quality & serving

6. **[LangChain](../GenAI-Topics/langchain/index.md)** →
   **[LangGraph](../GenAI-Topics/langgraph/index.md)** — chains, tools, memory,
   then stateful multi-step workflows.
7. **[Agent Engineering](../GenAI-Topics/agent-engineering/index.md)** +
   **[Building Agents — Deep Dive](../GenAI-Topics/agent-principles/index.md)** —
   the plan/act/observe loop, tool design, when *not* to use an agent.
8. **[MCP](../GenAI-Topics/mcp/index.md)** — connecting tools/data; MCP vs
   function calling.
9. **[Observability & Eval](../GenAI-Topics/observability/index.md)** — tracing,
   LLM-as-judge, an eval set; how you debug a wrong answer.
10. **[FastAPI](../Technologies/fastapi/index.md)** — serve a streaming
    RAG/agent endpoint with timeouts and input limits.

---

## Drills that move the needle

- **RAG improvement drill:** given "RAG accuracy is mediocre," list the levers in
  order (chunking → embeddings → hybrid retrieval → rerank → prompt → eval) using
  [Retrieval Tuning](../GenAI-Topics/retrieval-tuning/index.md).
- **Safe-agent drill:** design an agent that can take actions without going
  rogue — bounded loop, gated/least-privilege tools, output validation
  ([Building Agents](../GenAI-Topics/agent-principles/index.md) + [AI Security](../AI-Security/index.md)).
- **Debugging drill:** walk one [Production Incident](Interview_Production_Incidents.md)
  (e.g. retrieval dropped) as diagnose → mitigate → prevent.
- **Q&A banks:** [GenAI Interview Q&A](GenAI_Interview_QA.md) ·
  [AI Engineer Q&A](AI_Engineer_Interview_QA.md) ·
  [Agentic AI / Agents Q&A](Agents_Interview_QA.md) ·
  [LangChain / LangGraph Q&A](LangChain_LangGraph_Interview_QA.md) ·
  [MCP Q&A](MCP_Interview_QA.md).
- **Full run:** the [Master Interview Simulator](Interview_Master_Simulator.md),
  then the [Master Cheat Sheets](Interview_Cheat_Sheets.md).

---

## Are you ready? (self-check)

- [ ] I can design a correct RAG pipeline end to end and explain each choice.
- [ ] I know how to *improve* a mediocre RAG (the tuning levers, in order).
- [ ] I can build a bounded, tool-using agent that can't take unsafe actions.
- [ ] I can evaluate an LLM app (eval set + LLM-as-judge) and debug a wrong answer.
- [ ] I can serve it behind a FastAPI endpoint with streaming, timeouts, and limits.
- [ ] I know the failure modes of my components (why temp 0, why this embedding model).

If most boxes are checked, you're solid at Senior. To push toward **Staff**, add
the trade-off for every choice and how you'd verify at scale — see the
[Staff / Principal path](Path_Staff_Principal_Architect.md).

!!! note "Related paths"
    [Staff / Principal Architect path](Path_Staff_Principal_Architect.md) ·
    [Forward Deployed Engineer path](Path_FDE.md) ·
    [Data & AI / Platform Engineer path](Path_Data_Platform.md) ·
    [Interview Guide overview](Interview_Guide_Overview.md)
