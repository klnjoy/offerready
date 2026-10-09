---
icon: material/account-tie
---

# AI Engineer Role Guide

*Last reviewed: October 2026*

A role guide for **AI / GenAI Engineer** interviews at senior and staff level.
These are roles where you build and ship products on top of foundation models:
RAG, agents, tool use, evaluation, and the API around them. This page covers what
the role is, how the loop usually runs, what "strong hire" sounds like, the
questions you are most likely to get, and a 14-day plan. It links to the study
pages rather than repeating them.

!!! abstract "What this role is really testing"
    **Can you build it well and debug it?** Technology depth, a correct design
    with the right primitives, real debugging instinct, and knowing the failure
    modes of the tools you use. At senior level, clean, working, tested
    engineering wins. At staff level, add the trade-off behind every choice,
    how you would measure it, and how it holds up at scale.

    See [Senior / Staff / Principal / FDE](Interview_Level_Comparison.md) for what
    interviewers listen for at each level.

---

## What the role is in 2026

The term "AI engineer" was popularised in mid-2023 to describe software engineers
who build products on foundation models through APIs, as opposed to ML engineers
who train and tune the models themselves
([Latent Space, *The Rise of the AI Engineer*, June 2023](https://www.latent.space/p/ai-engineer)).
In 2026 the job has settled into a recognisable shape. You own an LLM-backed
feature end to end: the retrieval and context it uses, the prompts and tools, the
eval set that says whether it works, and the service that runs it in production.
You are expected to write production code, not notebooks.

What has changed since the early "prompt engineer" days is the weight on
**evaluation, agents and cost**. Interviewers assume you can call a model. They
want to know whether you can tell when it is wrong, stop an agent doing something
unsafe, and keep the bill predictable.

| | AI engineer | ML engineer | Forward deployed engineer | AI platform engineer |
|---|---|---|---|---|
| **Builds** | LLM features and agents for one product | Models: training, fine-tuning, feature pipelines | A working solution inside one customer's environment | The shared layer every AI team builds on |
| **Main user** | End users of the product | Product and data science teams | One customer's team and stakeholders | Internal AI and product engineers |
| **Core skills** | RAG, prompting, tool use, evals, API design | Statistics, training, model evaluation, MLOps | Scoping, fast building, integration, communication | Serving, gateways, GPUs, Kubernetes, observability |
| **Judged on** | Quality, latency and cost of one feature | Model metrics, then business lift | Customer outcome and time to value | Reliability, cost, and adoption by other teams |
| **Typical design question** | "Design a support assistant over our docs" | "Design a ranking model for the feed" | "This customer wants AI for claims. What do you ship in two weeks?" | "Design an LLM gateway for 40 teams" |
| **Guide** | This page | [GenAI Q&A](GenAI_Interview_QA.md) | [FDE guide](Path_FDE.md) | [AI Platform guide](Path_AI_Platform_Engineer.md) |

---

## The interview loop by company type

These are **common patterns**, not a description of any one company's current
process. Loops change often. Ask your recruiter for the round list and format
before you prepare, and check what the company publishes about its own process.

### Frontier lab or model provider

| Round | What it tests | Length |
|---|---|---|
| Recruiter + hiring manager screen | Motivation, scope of past work, mission fit | 30 min each |
| Coding (often practical, sometimes in your own editor) | Clean, working code under time pressure; often an LLM-adjacent task | 60 min |
| LLM system design | RAG or agent design with evals, safety and cost | 60 min |
| Applied ML / model behaviour depth | How models fail: sampling, context limits, tool-call errors, eval design | 45–60 min |
| Project deep dive | One shipped system, followed down to the details | 45–60 min |
| Values / behavioural | Judgment, safety mindset, working through disagreement | 45 min |

The process often runs three to five weeks from first call to decision. Expect a
higher bar on evaluation and on the safety side of agent design.

### Big tech

A standard software loop with an AI-flavoured design round. Usually two coding
rounds (data structures and algorithms, sometimes one practical), one system
design round where an LLM feature is the prompt, and one or two behavioural
rounds mapped to the company's competencies. A separate "AI depth" or domain
round is increasingly common for dedicated GenAI teams. The onsite is often four
to five rounds in one day or split across two. Leveling is decided largely from
design and behavioural signals.

### AI-native startup

Short and practical. A founder or lead engineer call, then a **take-home or
paired build** (for example "add retrieval and an eval harness to this repo" over
two to four hours, or a timed live build), a review of what you built, and a
culture or founder conversation. The whole process can finish within one to two
weeks. They want proof that you ship, so a working demo and honest notes on what
you cut beat polish.

### Enterprise or consulting

Panels that mix engineering with stakeholder judgment. Expect a technical screen,
a solution-design case on a business problem ("reduce call-centre handling time
with GenAI"), questions on governance, data residency and vendor choice, and often
a presentation to a mixed technical and business panel. They weigh delivery
experience and risk control more heavily than raw algorithm speed.

---

## Scoring rubric: what "strong hire" sounds like

| Round | Strong hire at senior | Strong hire at staff |
|---|---|---|
| **Coding** | Working, readable code; handles edge cases, timeouts and malformed model output; tests the happy path and one failure | Same, plus structure that would survive a team: clear interfaces, retries and idempotency where they matter, and a short note on what to test next |
| **LLM system design** | Correct pipeline (ingest, chunk, embed, retrieve, rerank, ground, cite); bounded agent loop; names an eval set and two metrics | Starts from requirements and success metrics; offers two designs and picks one with a reason; cost model in tokens × model tier; failure modes and graceful degradation; eval gates in CI |
| **AI depth** | Explains sampling, context limits, embeddings and RAG vs fine-tuning accurately | Explains *why* a model fails on a given input and how to prove it with an experiment, not a guess |
| **Debugging / incident** | Walks diagnose, mitigate, prevent; checks retrieval before blaming the model | Adds detection (what alert would have caught it) and a fix for the whole class of incident |
| **Project deep dive** | Clear ownership; can go two or three levels down on any component | Names the trade-off they would make differently now and the impact in numbers they can defend |
| **Behavioural** | Specific STAR stories with their own actions and a result | Stories that show influence beyond their own team, and a disagreement handled well |

---

## The 20 questions you are most likely to get

Grouped by round. Each links to the page that prepares you for it.

### Screen and AI depth

1. When would you use RAG, fine-tuning, or just a longer prompt? →
   [LLM Fundamentals](../GenAI-Topics/llm-fundamentals/index.md) ·
   [GenAI Q&A](GenAI_Interview_QA.md)
2. Explain temperature, top-p, and why low temperature does not make output
   correct. → [LLM Fundamentals](../GenAI-Topics/llm-fundamentals/index.md)
3. How do you pick an embedding model, and how would you know it is the problem?
   → [Embedding Models](../GenAI-Topics/embeddings/index.md)
4. What is context engineering, and what goes into the context budget first? →
   [Context Engineering](../GenAI-Topics/context-engineering/index.md)
5. How do you get reliable structured output from a model? →
   [Prompt Engineering](../GenAI-Topics/prompt-engineering/index.md)

### Coding

6. Build a small retrieval function: chunk documents, embed, return top-k with
   scores. → [Live-Coding Drills](Lab_LiveCoding_Drills.md) ·
   [Python Q&A](Python_Interview_QA.md)
7. Write a tool-calling loop with a step limit, a timeout, and validation of the
   model's arguments. → [Building Agents — Deep Dive](../GenAI-Topics/agent-principles/index.md)
8. Expose a streaming endpoint with input limits and a timeout. →
   [FastAPI](../Technologies/fastapi/index.md)

### LLM system design

9. Design a support assistant over 50,000 internal documents, with citations. →
   [RAG](../GenAI-Topics/rag/index.md) ·
   [Requirements → Production](Interview_Requirements_to_Production.md)
10. Our RAG answers are mediocre. What do you change, in what order? →
    [Retrieval Tuning](../GenAI-Topics/retrieval-tuning/index.md)
11. Design an agent that can take actions (refunds, tickets) without going rogue.
    → [Agent Engineering](../GenAI-Topics/agent-engineering/index.md) ·
    [AI Security](../AI-Security/index.md)
12. Single agent or multi-agent? Defend your choice. →
    [Agents Q&A](Agents_Interview_QA.md)
13. How would you connect the assistant to internal tools? MCP or plain function
    calling? → [MCP](../GenAI-Topics/mcp/index.md) · [MCP Q&A](MCP_Interview_QA.md)
14. Cut the cost of this feature by half without hurting quality. →
    [Cost Optimization](../GenAI-Topics/cost-optimization/index.md)

### Evaluation and debugging

15. Build an eval set for this assistant. Which metrics, and who labels? →
    [Observability & Eval](../GenAI-Topics/observability/index.md)
16. What are the biases of LLM-as-judge, and how do you control them? →
    [AI Engineer Q&A](AI_Engineer_Interview_QA.md)
17. Answers got worse after a model upgrade. Walk me through it. →
    [Production Incident Interviews](Interview_Production_Incidents.md)
18. How do you defend against prompt injection through retrieved documents? →
    [AI Security](../AI-Security/index.md)

### Project deep dive and behavioural

19. Walk me through an LLM system you shipped. What would you change? →
    [Keep Asking Why](Interview_Why_Chains.md)
20. Tell me about a time you pushed back on shipping an AI feature. →
    [Behavioral / STAR](Behavioral_STAR_Interview_QA.md)

---

## Common failure modes

- **Rehearsed answers that collapse under follow-up.** You give a fluent
  five-step RAG answer, then the interviewer asks "why that chunk size?" or "what
  happens when the reranker times out?" and there is nothing underneath. Practise
  each answer with three follow-ups deep, using the
  [why-chains](Interview_Why_Chains.md).
- **Blaming the model first.** Most bad answers trace to retrieval, chunking or
  context assembly. Check what the model was given before you change the model.
- **No evals.** "We tested it manually" reads as junior. Name an eval set, its
  size, how it was labelled, and the metric that gates a release.
- **Agents with no bounds.** Unlimited loops, tools with write access and no
  confirmation step, no audit log.
- **Ignoring cost and latency until asked.** Mention token budgets, caching and
  model routing as part of the design, not as an afterthought.
- **Name-dropping frameworks.** Saying "LangGraph" is not a design. Explain the
  state, the steps and the failure handling. The framework is a detail.
- **Vague project stories.** "We built a chatbot" with no numbers, no ownership
  and no trade-off you would change.

---

## The skills this guide builds

| Skill | Why it matters | Where you build it |
|-------|----------------|--------------------|
| **Solid RAG design** | The most common build; get chunking, retrieval and grounding right | [RAG](../GenAI-Topics/rag/index.md) · [Retrieval Tuning](../GenAI-Topics/retrieval-tuning/index.md) |
| **Reliable prompting & output** | Structured output, few-shot, guardrails | [Prompt Engineering](../GenAI-Topics/prompt-engineering/index.md) · [Context Engineering](../GenAI-Topics/context-engineering/index.md) |
| **A safe agent loop** | Bounded loops, gated tools, no runaway actions | [Agent Engineering](../GenAI-Topics/agent-engineering/index.md) · [Building Agents — Deep Dive](../GenAI-Topics/agent-principles/index.md) |
| **Evaluation & debugging** | Know *why* an answer is wrong; measure quality | [Observability & Eval](../GenAI-Topics/observability/index.md) |
| **Serving it as an API** | Ship the thing behind a real endpoint | [FastAPI](../Technologies/fastapi/index.md) |

---

## 14-day plan

One to two hours on weekdays, more at weekends. Say every answer out loud.

| Day | Focus | Do |
|---|---|---|
| 1 | Baseline | Add the job in OfferReady, read the gaps, and answer five questions from the list above out loud. Note where you stalled. |
| 2 | Fundamentals | [LLM Fundamentals](../GenAI-Topics/llm-fundamentals/index.md): tokens, sampling, embeddings, context windows, RAG vs fine-tuning. |
| 3 | Prompting & context | [Prompt Engineering](../GenAI-Topics/prompt-engineering/index.md) + [Context Engineering](../GenAI-Topics/context-engineering/index.md): structured output, context budget. |
| 4 | RAG core | [RAG](../GenAI-Topics/rag/index.md), [Vector DB](../GenAI-Topics/vector-db/index.md), [Embedding Models](../GenAI-Topics/embeddings/index.md). Draw the pipeline from memory. |
| 5 | RAG tuning | [Retrieval Tuning](../GenAI-Topics/retrieval-tuning/index.md). Drill question 10 until the levers come out in order. |
| 6 | Coding | Questions 6–8 timed, 45 minutes each, from [Live-Coding Drills](Lab_LiveCoding_Drills.md). |
| 7 | Mock 1 | A full voice mock with a system-design round. Write down every follow-up you could not answer. |
| 8 | Agents | [Agent Engineering](../GenAI-Topics/agent-engineering/index.md) + [Building Agents](../GenAI-Topics/agent-principles/index.md): plan, act, observe; tool design; when not to use an agent. |
| 9 | Tools & frameworks | [LangChain](../GenAI-Topics/langchain/index.md) → [LangGraph](../GenAI-Topics/langgraph/index.md), then [MCP](../GenAI-Topics/mcp/index.md): remote servers, auth, tool poisoning. |
| 10 | Evals | [Observability & Eval](../GenAI-Topics/observability/index.md): build a 20-item eval set for your design from day 4. For agents, score outcome and trajectory over several trials. |
| 11 | Security & cost | [AI Security](../AI-Security/index.md) and [Cost Optimization](../GenAI-Topics/cost-optimization/index.md). Add both to your day-4 design. |
| 12 | Incidents & depth | Two [Production Incidents](Interview_Production_Incidents.md), then five-deep [why-chains](Interview_Why_Chains.md) on your main project. |
| 13 | Mock 2 | Full voice mock with Deep follow-ups on. Compare against mock 1. |
| 14 | Light review | [Cheat Sheets](Interview_Cheat_Sheets.md), your stories, sleep. |

**Q&A banks to use along the way:** [GenAI](GenAI_Interview_QA.md) ·
[AI Engineer](AI_Engineer_Interview_QA.md) · [Agents](Agents_Interview_QA.md) ·
[LangChain / LangGraph](LangChain_LangGraph_Interview_QA.md) · [MCP](MCP_Interview_QA.md).

---

## Are you ready? (self-check)

- [ ] I can design a correct RAG pipeline end to end and explain each choice.
- [ ] I know how to *improve* a mediocre RAG (the tuning levers, in order).
- [ ] I can build a bounded, tool-using agent that can't take unsafe actions.
- [ ] I can evaluate an LLM app (eval set + LLM-as-judge) and debug a wrong answer.
- [ ] I can serve it behind a FastAPI endpoint with streaming, timeouts, and limits.
- [ ] I know the failure modes of my components (why temp 0 or low reasoning effort, why this embedding model).
- [ ] I can explain context engineering and the main LLM cost levers (routing, prompt caching, batch, token budgets).
- [ ] I can survive three follow-up questions on any answer above.

If most boxes are checked, you're solid at senior. To push toward **staff**, add
the trade-off for every choice and how you'd verify at scale. See the
[Staff / Principal guide](Path_Staff_Principal_Architect.md).

---

## Practise this in OfferReady

Reading is not practice. Run the questions out loud against a real job.

[:material-briefcase-plus: Add a job](https://klnjoy.github.io/offerready-app/analyze){ .md-button .md-button--primary target=_blank rel=noopener }
[:material-microphone: Voice mock](https://klnjoy.github.io/offerready-app/interview/voice){ .md-button target=_blank rel=noopener }
[:material-dumbbell: Practice questions](https://klnjoy.github.io/offerready-app/practice){ .md-button target=_blank rel=noopener }

- **Add a job** reads the job description and builds a plan around your gaps.
- **Voice mock** runs a spoken interview. Turn on **Deep follow-ups** to get the
  "why?" questions that expose rehearsed answers, and use the **whiteboard** in
  the system-design round to sketch the pipeline as you talk.
- **Practice** gives you scored questions for this role, one at a time.

!!! note "Related role guides"
    [Forward Deployed Engineer](Path_FDE.md) ·
    [AI Platform Engineer](Path_AI_Platform_Engineer.md) ·
    [Data Platform Engineer](Path_Data_Platform.md) ·
    [Staff / Principal AI Architect](Path_Staff_Principal_Architect.md) ·
    [Interview Guide overview](Interview_Guide_Overview.md)
