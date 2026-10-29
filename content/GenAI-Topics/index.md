---
icon: material/robot-outline
---

# GenAI Topics

*Last reviewed: October 2026*

The building blocks of generative and agentic AI, from how models work through
to running them reliably in production. Each topic page has diagrams, the
trade-offs that matter, and an interview deep dive.

**Who it's for:** engineers preparing for senior, staff or principal AI, ML
platform or forward-deployed roles who need to explain *why* a design works, not
just which library to import. If you'd rather build something first, start with
the [Setup Guides](../Setup-Guides/index.md) and come back here for the theory.

## Learn → Build → Ship → Grow

Every topic an AI engineer is expected to know, in the order to learn it, and
the page here that covers it. Learn one topic a week and build something small
with each one.

```mermaid
flowchart LR
    L[Learn<br/>how LLMs work, prompts,<br/>context, models] --> B[Build<br/>embeddings, vector DBs, RAG,<br/>agents and frameworks]
    B --> S[Ship<br/>MCP, safety, evals,<br/>observability, cost, ops]
    S --> G[Grow<br/>projects, interviews,<br/>economics, trends]
```

| Stage | Topic | Read |
|---|---|---|
| **Learn** | How LLMs work: tokens, attention, sampling, temperature | [LLM Fundamentals](llm-fundamentals/index.md) |
| | Prompt engineering: few-shot, chain of thought, structured output | [Prompt Engineering](prompt-engineering/index.md) |
| | Context engineering: memory, retrieval, what goes in the window | [Context Engineering](context-engineering/index.md) |
| | Models and model choice: open vs closed, cost, latency, quality | [LLM Fundamentals](llm-fundamentals/index.md) · [AI economics](ai-economics/index.md) |
| **Build** | Embeddings and embedding models | [Embedding Models](embeddings/index.md) |
| | Vector databases: indexing, chunking, similarity search | [Vector DB](vector-db/index.md) |
| | RAG: retrieval, re-ranking, hybrid search, RAG vs fine-tuning | [RAG](rag/index.md) · [Retrieval Tuning](retrieval-tuning/index.md) |
| | Knowledge graphs and GraphRAG | [Graph DB](graph-db/index.md) |
| | Agents: tool calling, planning, reflection, memory, multi-agent | [Agent architecture](agent-architecture/index.md) · [Agent Engineering](agent-engineering/index.md) · [Building Agents](agent-principles/index.md) · [7 diagrams](agent-diagrams/index.md) |
| | Frameworks and platforms | [LangChain](langchain/index.md) · [LangGraph](langgraph/index.md) · [Bedrock](bedrock/index.md) · [AgentCore](agentcore/index.md) |
| **Ship** | MCP and agent-to-agent protocols | [MCP](mcp/index.md) · [A2A](a2a/index.md) |
| | Safety: prompt injection, guardrails, output validation, access | [AI Security](../AI-Security/index.md) · [Guardrails](agent-diagrams/index.md#5-guardrails-and-permissions) |
| | Evals and observability: tracing, regression tests, LLM judges | [Observability & Eval](observability/index.md) |
| | Production: rate limits, caching, queues, scaling, incidents | [LLMOps](llmops/index.md) · [Reliability](reliability/index.md) · [Kubernetes](kubernetes/index.md) · [DevOps for AI](devops-ai/index.md) |
| | Cost control | [Cost Optimization](cost-optimization/index.md) |
| **Grow** | Portfolio projects | [7 AI projects](../Projects/portfolio/index.md) |
| | Courses, if you need the basics first | [Free courses, in order](free-courses/index.md) |
| | The business side | [AI economics](ai-economics/index.md) · [Trends & market](trends/index.md) |
| | Interview preparation | [OfferReady app](https://getofferready.app/analyze): plan, practice and mock interviews for your job |

Not covered here yet: multimodal AI (vision, speech, image and video
generation) and AI coding tools. Their official docs are the best place to
start.

!!! tip "Short on time? Start with the pictures"
    [Agentic AI in 7 diagrams](agent-diagrams/index.md): harness, context,
    tools, memory, guardrails, evals and tracing, each as one flow diagram
    and five steps. New to AI? [Free courses, in order](free-courses/index.md)
    lists the few you need, stage by stage.
    Want the business view? [AI economics in 2026](ai-economics/index.md):
    who gets paid, why inference is the bill that grows, and the interview
    questions it brings.
    Ready to build? [7 AI projects that get you interviews](../Projects/portfolio/index.md).

## 1. Foundations

<div class="grid cards" markdown>

-   :material-school: __LLM Fundamentals__

    ---

    Tokens, attention, sampling, context windows, and when to use fine-tuning
    versus RAG.

    [:octicons-arrow-right-24: Open](llm-fundamentals/index.md)

-   :material-text-box-edit: __Prompt Engineering__

    ---

    Instructions, few-shot examples, reasoning strategies and structured output.

    [:octicons-arrow-right-24: Open](prompt-engineering/index.md)

-   :material-window-restore: __Context Engineering__

    ---

    Deciding what goes into the context window: assembly, memory, compaction and
    token budgets.

    [:octicons-arrow-right-24: Open](context-engineering/index.md)

-   :material-dots-hexagon: __Embedding Models__

    ---

    How text becomes vectors, and how to choose and use embedding models for
    search and RAG.

    [:octicons-arrow-right-24: Open](embeddings/index.md)

</div>

## 2. Retrieval and knowledge

<div class="grid cards" markdown>

-   :material-database-search: __RAG__

    ---

    Retrieval-augmented generation end to end: indexing, retrieval, grounding
    and citations.

    [:octicons-arrow-right-24: Open](rag/index.md)

-   :material-vector-triangle: __Vector Databases__

    ---

    How similarity search works, ANN indexes, distance metrics and choosing a
    store.

    [:octicons-arrow-right-24: Open](vector-db/index.md)

-   :material-tune: __Retrieval Tuning__

    ---

    Top-K, metadata filtering and reranking: the levers with the biggest effect
    on RAG quality.

    [:octicons-arrow-right-24: Open](retrieval-tuning/index.md)

-   :material-graph-outline: __Graph DB & GraphRAG__

    ---

    Nodes, relationships, knowledge graphs, and retrieval that follows
    connections.

    [:octicons-arrow-right-24: Open](graph-db/index.md)

</div>

## 3. Orchestration and agents

<div class="grid cards" markdown>

-   :material-link-variant: __LangChain__

    ---

    Composing prompts, models, retrievers and tools into LLM applications.

    [:octicons-arrow-right-24: Open](langchain/index.md)

-   :material-graph: __LangGraph__

    ---

    Agent workflows as stateful graphs, with cycles, branching and
    human-in-the-loop.

    [:octicons-arrow-right-24: Open](langgraph/index.md)

-   :material-connection: __MCP__

    ---

    Model Context Protocol, the open standard that connects LLM hosts to tools
    and data servers.

    [:octicons-arrow-right-24: Open](mcp/index.md)

-   :material-account-switch: __A2A__

    ---

    Agent-to-agent communication for delegating and coordinating across teams
    of agents.

    [:octicons-arrow-right-24: Open](a2a/index.md)

-   :material-robot-industrial: __Agent Engineering__

    ---

    A survey of building agents that reason, use tools and act reliably.

    [:octicons-arrow-right-24: Open](agent-engineering/index.md)

-   :material-head-cog: __Agent Principles & Patterns__

    ---

    A code-level deep dive into agent principles, control-flow patterns and the
    anti-patterns to avoid.

    [:octicons-arrow-right-24: Open](agent-principles/index.md)

-   :material-account-cog: __AgentCore__

    ---

    Amazon Bedrock AgentCore: runtime, memory, gateway, identity and
    observability for production agents.

    [:octicons-arrow-right-24: Open](agentcore/index.md)

-   :material-aws: __Amazon Bedrock__

    ---

    AWS's managed multi-provider model API, with knowledge bases, agents and
    guardrails.

    [:octicons-arrow-right-24: Open](bedrock/index.md)

</div>

## 4. Production

<div class="grid cards" markdown>

-   :material-chart-line: __Observability & Evaluation__

    ---

    Tracing, evaluation sets, LLM-as-judge and production monitoring.

    [:octicons-arrow-right-24: Open](observability/index.md)

-   :material-cog-sync: __LLMOps / Deployment__

    ---

    Serving, scaling, caching, versioning and the lifecycle of models and
    prompts.

    [:octicons-arrow-right-24: Open](llmops/index.md)

-   :material-cash-multiple: __Cost Optimization__

    ---

    A practical playbook for cutting token and call costs without losing
    quality.

    [:octicons-arrow-right-24: Open](cost-optimization/index.md)

-   :material-shield-refresh: __Reliability & Distributed Systems__

    ---

    Timeouts, retries, circuit breakers and the failure modes specific to AI
    systems.

    [:octicons-arrow-right-24: Open](reliability/index.md)

-   :material-infinity: __DevOps for AI__

    ---

    Version control, infrastructure as code, CI/CD pipelines and deployment
    strategies for AI systems.

    [:octicons-arrow-right-24: Open](devops-ai/index.md)

-   :material-kubernetes: __Kubernetes & Containers__

    ---

    Running model serving and GPU workloads: images, cold starts, autoscaling.

    [:octicons-arrow-right-24: Open](kubernetes/index.md)

</div>

## 5. Landscape

<div class="grid cards" markdown>

-   :material-trending-up: __GenAI Trends & Market__

    ---

    A dated snapshot of where the field is, so your answers reflect today rather
    than 2023.

    [:octicons-arrow-right-24: Open](trends/index.md)

</div>

## Practise what you read

- Interview Q&A: [GenAI](../Personal-SourceCode/GenAI_Interview_QA.md) ·
  [Agents](../Personal-SourceCode/Agents_Interview_QA.md) ·
  [LangChain & LangGraph](../Personal-SourceCode/LangChain_LangGraph_Interview_QA.md) ·
  [MCP](../Personal-SourceCode/MCP_Interview_QA.md) ·
  [AI Engineer](../Personal-SourceCode/AI_Engineer_Interview_QA.md)
- Role path: [AI Engineer](../Personal-SourceCode/Path_AI_Engineer.md).
