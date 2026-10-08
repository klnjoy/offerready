---
icon: material/help-circle
---

# FAQ

*Last reviewed: October 2026*

Short, opinionated answers to the questions that come up most in design
reviews and senior interviews. Each links to a deeper page. Expand a question
to read the answer.

## Concepts

??? question "RAG or fine-tuning: which do I use?"
    **Knowledge** (fresh, private or changing facts, need for citations) →
    **RAG**. **Behaviour, style or format** → **fine-tuning** (often LoRA).
    Most apps start with RAG plus good prompting and only fine-tune once an
    eval shows prompting cannot reach the bar. They combine well: fine-tune for
    format, RAG for facts. See [LLM Fundamentals](../../GenAI-Topics/llm-fundamentals/index.md).

??? question "What's the difference between prompt engineering and context engineering?"
    Prompt engineering is the *wording and structure* of instructions. Context
    engineering is *what goes into the context window and how it is budgeted*
    across a conversation or agent run: retrieved docs, tool results, memory,
    history and compaction. See [Context Engineering](../../GenAI-Topics/context-engineering/index.md).

??? question "Do million-token context windows make RAG obsolete?"
    No, but they shrink its territory. For a small, stable corpus, putting it
    in context with prompt caching can be simpler. RAG still wins on cost per
    query, latency, freshness, per-user access control and citations, and
    models use mid-context material less reliably than material near the start
    or end. See [RAG Flow](../rag-flow/index.md).

??? question "Top-K vs reranking?"
    Top-K is how many candidates retrieval returns. Reranking is a second, more
    accurate model that reorders those candidates by true relevance. Use both:
    retrieve wide (dozens), rerank, pass narrow (a handful) to the model. See
    [RAG](../../GenAI-Topics/rag/index.md).

??? question "Vector DB or graph DB for retrieval?"
    Vector DB for semantic similarity over text; graph DB for multi-hop,
    relationship questions (GraphRAG). Often complementary. Many teams start
    with vector search in an existing database (for example Postgres with
    pgvector) before adopting a dedicated store. See
    [Vector DB](../../GenAI-Topics/vector-db/index.md) /
    [Graph DB](../../GenAI-Topics/graph-db/index.md).

??? question "What are reasoning models, and when should I use high effort?"
    Models that spend extra tokens thinking before answering, with an
    adjustable effort or thinking budget. Use high effort for multi-step
    reasoning, planning, hard coding and analysis; use low effort or a fast
    tier for extraction, classification and simple chat. Effort costs tokens
    and latency, so set it per task. See [Model Selection](../model-selection/index.md).

## Building

??? question "Chain or agent?"
    Chain (workflow) when the steps are known and fixed; agent when the model
    must decide which tools to call and in what order. Agents cost more, vary
    more and need guardrails. A common middle ground is a workflow with one
    bounded agentic step. See [Agent Workflow](../agent-workflow/index.md).

??? question "How do I stop my agent from doing something dangerous?"
    Least-privilege tools with scoped credentials, read/write separation,
    policy checks in code, human approval for irreversible actions,
    iteration and cost caps, and full tracing. Prompt instructions are a hint,
    not a control. See [Agent Workflow](../agent-workflow/index.md) and
    [Security & Governance](../security-governance/index.md).

??? question "What is MCP and do I need it?"
    The Model Context Protocol is an open standard for exposing tools,
    resources and prompts to models through a client-server interface. Use it
    when tools should be reusable across agents or clients; for a single app
    with two internal functions, native tool calling is enough. Review
    third-party MCP servers like any dependency. See [MCP](../../GenAI-Topics/mcp/index.md).

??? question "How do I get reliable structured output?"
    Use the provider's structured-output or tool-calling feature with a JSON
    schema, validate server-side, retry once with the validation error, then
    fall back. Keep schemas small and use enums. See
    [Prompt Best Practices](../prompt-best-practices/index.md).

??? question "Single agent or multi-agent?"
    Start single. Split into supervisor and specialists when one agent's tool
    set or context becomes unreliable, or when subtasks are independent and
    benefit from parallel, isolated contexts. Measure whether the split
    actually improves task success per dollar.

## Evaluation

??? question "How do I evaluate a GenAI app?"
    Separate retrieval metrics (recall@k, MRR) from generation metrics
    (faithfulness, answer relevance). Use a labeled set built from real
    traffic, plus LLM-as-judge calibrated against human labels, and run it in
    CI on every prompt, model or retrieval change. See
    [Observability & Eval](../../GenAI-Topics/observability/index.md).

??? question "How big should my eval set be?"
    Rule of thumb: start with 50 to 200 representative cases covering main
    intents and known edge cases, then grow it from production failures. Size
    matters less than coverage of the slices you care about; report per-slice
    results, not just an average.

??? question "Can I trust LLM-as-judge?"
    Only after calibration. Write a specific rubric, compare judge scores to a
    human-labeled sample, track agreement, and watch for known biases such as
    preferring longer answers or the first option shown. Re-calibrate when the
    judge model changes.

## Operations

??? question "How do I cut LLM cost?"
    In rough order of impact: route easy traffic to cheaper tiers, cache stable
    prompt prefixes, cut unnecessary agent iterations, cap output and reasoning
    effort, cache repeated responses, and use batch APIs for offline work. See
    [Cost Optimization](../../GenAI-Topics/cost-optimization/index.md) and
    [LLMOps](../../GenAI-Topics/llmops/index.md).

??? question "Managed API or self-hosted model?"
    Managed (provider API, Bedrock, Vertex AI, Azure) to ship fast with the
    newest models; self-host open weights (vLLM, SGLang, TGI) for data control,
    deep customisation or sustained high utilisation. At low or spiky volume,
    idle GPUs usually cost more than per-token APIs. See
    [Model Selection](../model-selection/index.md).

??? question "How do I handle model upgrades and deprecations?"
    Route all calls through an internal gateway, pin versioned model IDs, keep
    an eval set, test candidate replacements and fallbacks, adjust prompts per
    model, then canary. Treat a model change like a dependency upgrade.

??? question "What should I log?"
    Per request: prompt and model versions, model ID, retrieved chunk IDs, tool
    calls and results, token counts by type, latency per span, cost, and user
    feedback. Redact PII and set retention limits, because traces are sensitive
    data. See [Troubleshooting](../troubleshooting/index.md).

## Security and governance

??? question "Can prompt injection be fully prevented?"
    Not with current techniques. Design so that a successful injection has
    limited impact: least privilege, separate read and write tools, approval on
    outbound or irreversible actions, output filtering, and monitoring. See
    [Security & Governance](../security-governance/index.md).

??? question "Is it safe to send customer data to a model provider?"
    It depends on the provider's data terms (retention, training use,
    zero-retention options), region of processing, your contracts and your
    regulatory obligations. In-account cloud hosting or in-platform AI
    (for example [Snowflake Cortex](../../Snowflake-Cortex/index.md)) reduces
    egress. Get a data-flow diagram reviewed by security and legal.

??? question "Which frameworks should I map controls to?"
    OWASP Top 10 for LLM Applications for threats, NIST AI RMF or ISO/IEC 42001
    for AI risk management, the EU AI Act if you serve EU users, plus your
    existing SOC 2, ISO 27001 and privacy obligations.

## This site

??? question "How do I use the retrieval agent in this site?"
    ```bash
    cd agent
    python ask.py "your question"
    python ask.py --area snowflake "MERGE upsert pattern"
    ```
    It answers from this knowledge base with citations. See the `agent/README.md`.

??? question "How should I use these reference pages for interview prep?"
    Read the page, then answer its "How interviewers probe this" questions
    aloud before expanding the notes. Follow up with the matching question bank,
    such as [GenAI Interview Q&A](../../Personal-SourceCode/GenAI_Interview_QA.md)
    or [Agents Interview Q&A](../../Personal-SourceCode/Agents_Interview_QA.md),
    and the [Interview Cheat Sheets](../../Personal-SourceCode/Interview_Cheat_Sheets.md).

## How interviewers probe this

??? question "Which of these answers do interviewers push hardest on?"
    The trade-off questions: RAG vs fine-tuning vs long context, workflow vs
    agent, managed vs self-hosted, and how you evaluate. A strong answer names
    the criteria, gives a default, says what evidence would change it, and
    describes how you would measure the outcome.

??? question "What separates a senior answer from a staff or principal one?"
    Senior answers solve the system in front of them. Staff and principal
    answers add the organisation: shared gateways and eval platforms, cost
    attribution, governance processes, migration paths across model
    generations, and how other teams adopt the pattern. See
    [Interview Level Comparison](../../Personal-SourceCode/Interview_Level_Comparison.md).

## Further reading

- [OWASP Top 10 for LLM Applications](https://genai.owasp.org/llm-top-10/)
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- [Lewis et al., Retrieval-Augmented Generation](https://arxiv.org/abs/2005.11401)
