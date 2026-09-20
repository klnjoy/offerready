---
icon: material/calendar-check
---

# 30-Day Prep Plan

A practical, four-week plan to go from "I know the topics" to "I can design,
build, and defend production AI systems in an interview." Every day maps to
specific OfferReady pages so you're never guessing what to study.

!!! tip "How to run it"
    ~1–2 focused hours/day. Each day = **learn → practice out loud → self-quiz.**
    Reading isn't rehearsing; say answers aloud and time yourself (~2 min). Track
    yourself in [Practice mode](Interview_Practice.md) and the
    [Progress Dashboard](Interview_Progress.md). Adjust weeks to your target role
    (see [Level Comparison](Interview_Level_Comparison.md)).

**Daily rhythm:** 1) read/skim the concept page · 2) do the linked drill/Q&A out
loud · 3) run the page's self-quiz · 4) note weak spots to revisit on the review day.

---

## Week 1 — LLMs, RAG & AI fundamentals

Goal: fluent on the building blocks and retrieval.

| Day | Focus | Pages |
|-----|-------|-------|
| 1 | LLM fundamentals (tokens, sampling, context, tool calling) | [LLM Fundamentals](../GenAI-Topics/llm-fundamentals/index.md) |
| 2 | Prompt + context engineering | [Prompt](../GenAI-Topics/prompt-engineering/index.md) · [Context](../GenAI-Topics/context-engineering/index.md) |
| 3 | RAG end to end | [RAG](../GenAI-Topics/rag/index.md) · [Retrieval Tuning](../GenAI-Topics/retrieval-tuning/index.md) |
| 4 | Embeddings + vector/graph DB | [Embeddings](../GenAI-Topics/embeddings/index.md) · [Vector DB](../GenAI-Topics/vector-db/index.md) |
| 5 | AI Engineer Q&A (RAG/eval/cost) | [AI Engineer Q&A](AI_Engineer_Interview_QA.md) |
| 6 | Practice: RAG scenario + a design | [Scenario Drills](Lab_Scenario_Drills.md) · [Requirements → Production](Interview_Requirements_to_Production.md) |
| 7 | **Review** week 1 weak spots + [Why-chains: RAG/model](Interview_Why_Chains.md) | Cheat sheet: [LLM/RAG](Interview_Cheat_Sheets.md) |

## Week 2 — Agents, MCP & Security

Goal: design safe, reliable agentic systems and defend them.

| Day | Focus | Pages |
|-----|-------|-------|
| 8 | Agent principles + patterns (deep) | [Agent Principles](../GenAI-Topics/agent-principles/index.md) |
| 9 | LangChain / LangGraph | [LangGraph](../GenAI-Topics/langgraph/index.md) · [LC/LG Q&A](LangChain_LangGraph_Interview_QA.md) |
| 10 | MCP + tools | [MCP](../GenAI-Topics/mcp/index.md) · [MCP Q&A](MCP_Interview_QA.md) |
| 11 | **AI Security** (injection, tool poisoning, threat modeling) | [AI Security](../AI-Security/index.md) |
| 12 | Agents Q&A + a multi-agent design | [Agents Q&A](Agents_Interview_QA.md) · [Case Studies](../Case-Studies/index.md) |
| 13 | Practice: agent + security scenarios | [Scenario Drills](Lab_Scenario_Drills.md) · [Why-chains: agents/security](Interview_Why_Chains.md) |
| 14 | **Review** + [Hackathon build](Lab_Hackathon_Builds.md) (agent/MCP challenge) | Cheat sheet: [Agents/MCP/Security](Interview_Cheat_Sheets.md) |

## Week 3 — Data & Cloud platform

Goal: depth on the data/cloud stack around AI.

| Day | Focus | Pages |
|-----|-------|-------|
| 15 | SQL (windows, tuning, modeling) | [SQL Q&A](SQL_Interview_QA.md) · [Live-Coding Drills](Lab_LiveCoding_Drills.md) |
| 16 | Data engineering / pipelines | [Data Engineering Q&A](DataEngineering_Interview_QA.md) |
| 17 | Snowflake + Cortex | [Snowflake](../Technologies/snowflake/index.md) · [Snowflake Q&A](Snowflake_Interview_QA.md) |
| 18 | Databricks / Spark / Delta | [Databricks Q&A](Databricks_Interview_QA.md) |
| 19 | dbt + AWS | [dbt Q&A](dbt_Interview_QA.md) · [AWS Q&A](AWS_Interview_QA.md) |
| 20 | Python for AI + live-coding drills | [Python Q&A](Python_Interview_QA.md) · [Live-Coding Drills](Lab_LiveCoding_Drills.md) |
| 21 | **Review** + [Why-chains: data platform](Interview_Why_Chains.md) | Cheat sheet: [Snowflake/Databricks/SQL/Python](Interview_Cheat_Sheets.md) |

## Week 4 — System design, ops & production

Goal: put it together at senior/principal depth and rehearse full loops.

| Day | Focus | Pages |
|-----|-------|-------|
| 22 | LLMOps + Production CI/CD (Kiro/Jenkins) | [LLMOps](../GenAI-Topics/llmops/index.md) · [DevOps for AI](../GenAI-Topics/devops-ai/index.md) |
| 23 | Observability + Reliability | [Observability](../GenAI-Topics/observability/index.md) · [Reliability](../GenAI-Topics/reliability/index.md) |
| 24 | Kubernetes + cost/performance | [Kubernetes](../GenAI-Topics/kubernetes/index.md) · [Cost](../GenAI-Topics/cost-optimization/index.md) |
| 25 | Production incidents | [Production Incident Interviews](Interview_Production_Incidents.md) |
| 26 | Full system design | [Requirements → Production](Interview_Requirements_to_Production.md) · [Case Studies](../Case-Studies/index.md) |
| 27 | Behavioral / STAR story bank | [Behavioral / STAR](Behavioral_STAR_Interview_QA.md) |
| 28 | Full mock loop | [Master Interview Simulator](Interview_Master_Simulator.md) |
| 29 | **Level-tune** your answers (Senior→Staff→Principal/FDE) | [Level Comparison](Interview_Level_Comparison.md) |
| 30 | Final review: [cheat sheets](Interview_Cheat_Sheets.md) + retake weak self-quizzes | all self-quizzes |

---

## Track adjustments

Weight the weeks toward your target role (see [Level Comparison](Interview_Level_Comparison.md)):

- **AI / GenAI Engineer:** full plan as written.
- **Data / Analytics / Snowflake / Databricks Engineer:** double Week 3; keep
  Weeks 1–2 lighter (RAG + agents awareness).
- **Forward-Deployed Engineer:** add the [FDE pages](Forward_Deployed_Engineer_Interview_QA.md)
  and [FDE Live-Coding](FDE_LiveCoding_Scenarios_Prep.md) across Weeks 2 + 4;
  emphasize Requirements → Production and communication.
- **Staff / Principal:** spend extra time on Week 4 (system design, cost,
  governance) and the [Why-chains](Interview_Why_Chains.md).

## The week-before checklist

- [ ] Can design a full system from [Requirements → Production](Interview_Requirements_to_Production.md) out loud
- [ ] Can defend each decision 5 "why"s deep ([Why-chains](Interview_Why_Chains.md))
- [ ] Can walk 3 [production incidents](Interview_Production_Incidents.md) end to end
- [ ] Have 6–8 [STAR stories](Behavioral_STAR_Interview_QA.md) ready
- [ ] Skimmed the [cheat sheets](Interview_Cheat_Sheets.md) the night before

!!! note "Related"
    [Overview & Study Path](Interview_Guide_Overview.md) ·
    [Master Interview Simulator](Interview_Master_Simulator.md) ·
    [Practice mode](Interview_Practice.md) · [Progress Dashboard](Interview_Progress.md)
