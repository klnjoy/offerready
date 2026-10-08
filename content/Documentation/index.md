---
icon: material/book-open-variant
---

# Documentation

*Last reviewed: October 2026*

Practical, cross-cutting reference pages for building and operating GenAI
systems in production: architecture, retrieval, agents, model choice,
prompting, security, troubleshooting and quick answers. They complement the
per-topic deep dives under [GenAI Topics](../GenAI-Topics/index.md) and the
interview Q&A banks.

Each page follows the same shape, so you can use it both as a working reference
and as interview preparation:

- **Mechanics first**: diagrams, decision tables and worked examples.
- **Failure modes**: what breaks in production and how you would notice.
- **How interviewers probe this**: senior-level questions with what a strong
  answer covers.
- **Further reading**: official docs, specs and primary papers only.

<div class="grid cards" markdown>

-   :material-sitemap: __Architecture Overview__

    ---

    The layers of a production GenAI application, request lifecycle, and where
    latency, cost and risk live.

    [:octicons-arrow-right-24: Open](architecture-overview/index.md)

-   :material-database-search: __RAG Flow__

    ---

    Indexing and query pipelines step by step: parsing, chunking, hybrid
    search, re-ranking, context assembly and RAG evaluation.

    [:octicons-arrow-right-24: Open](rag-flow/index.md)

-   :material-robot: __Agent Workflow__

    ---

    The plan, act, observe loop; tool design; bounding cost and risk; single
    vs multi-agent; durable execution.

    [:octicons-arrow-right-24: Open](agent-workflow/index.md)

-   :material-select-compare: __Model Selection Guide__

    ---

    Choosing between frontier, mid-tier, fast and open-weight models in the
    October 2026 landscape, plus routing and eval-driven selection.

    [:octicons-arrow-right-24: Open](model-selection/index.md)

-   :material-text-box-check: __Prompt Engineering Best Practices__

    ---

    Prompt structure, few-shot, structured output, reasoning effort, prompt
    caching and treating prompts as versioned code.

    [:octicons-arrow-right-24: Open](prompt-best-practices/index.md)

-   :material-shield-lock: __Security & Governance__

    ---

    Prompt injection, data leakage, agent permissions, guardrails, audit,
    and mapping controls to OWASP, NIST and the EU AI Act.

    [:octicons-arrow-right-24: Open](security-governance/index.md)

-   :material-wrench: __Troubleshooting__

    ---

    Symptom, cause and fix tables for RAG, agents, latency and cost, evals,
    and deployment.

    [:octicons-arrow-right-24: Open](troubleshooting/index.md)

-   :material-help-circle: __FAQ__

    ---

    Short, opinionated answers to the questions that come up most in design
    reviews and interviews.

    [:octicons-arrow-right-24: Open](faq/index.md)

</div>

## Suggested reading paths

| If you are preparing for... | Read in this order |
|-----------------------------|--------------------|
| AI / GenAI engineer loops | [Architecture](architecture-overview/index.md) → [RAG Flow](rag-flow/index.md) → [Prompting](prompt-best-practices/index.md) → [Troubleshooting](troubleshooting/index.md) |
| Agent-heavy or applied AI roles | [Agent Workflow](agent-workflow/index.md) → [Security & Governance](security-governance/index.md) → [Model Selection](model-selection/index.md) |
| Staff / principal architecture rounds | [Architecture](architecture-overview/index.md) → [Model Selection](model-selection/index.md) → [Security & Governance](security-governance/index.md) → [FAQ](faq/index.md) |
| Data platform roles moving into AI | [Architecture](architecture-overview/index.md) (data stack section) → [RAG Flow](rag-flow/index.md) → [Security & Governance](security-governance/index.md) |

!!! tip "Pair these pages with practice"
    After each page, answer its "How interviewers probe this" questions out
    loud before reading the strong-answer notes. Then drill the matching
    question bank, for example
    [GenAI Interview Q&A](../Personal-SourceCode/GenAI_Interview_QA.md),
    [Agents Interview Q&A](../Personal-SourceCode/Agents_Interview_QA.md) or
    [Production Incidents](../Personal-SourceCode/Interview_Production_Incidents.md).
