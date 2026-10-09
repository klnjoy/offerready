---
icon: material/database-cog
---

# Data Platform Engineer Role Guide

*Last reviewed: October 2026*

A role guide for **Data Platform Engineer** and senior **Data Engineer**
interviews in companies where the data platform also feeds AI. You own the data
side: warehousing and lakehouse, ELT, modelling, governance, and the native AI
features that run next to governed data. This page covers the role, the usual
loop, the rubric, the likely questions, and a 14-day plan. It links to the study
pages rather than repeating them.

!!! abstract "What this role is really testing"
    **Can you build and govern the data platform that analytics and AI run on?**
    Correct SQL and pipelines, sound modelling, cost and performance tuning,
    governance (RBAC, masking, lineage), and how native AI (Cortex, Mosaic AI)
    fits inside the governance boundary. Depth in data engineering beats GenAI
    breadth here.

    Building model serving, LLM gateways or GPU infrastructure instead? See the
    [AI Platform Engineer guide](Path_AI_Platform_Engineer.md).

---

## What the role is in 2026

Data platform work has always been about getting correct, fresh, affordable data
to the people who need it. What AI changed is the list of consumers. Besides
dashboards and analysts, the platform now feeds retrieval pipelines, agents that
query the warehouse in natural language, and model features. That raises the bar
on three things interviewers now probe directly:

- **Governance in the AI path.** Row-level security and masking must still hold
  when an agent or a RAG pipeline reads the data.
- **Unstructured data.** Documents, transcripts and images sit next to tables,
  and someone has to chunk, index and keep them in sync.
- **Cost.** Warehouse credits or DBUs plus model tokens, with clear owners.

Most loops still put **SQL and data modelling first**. If those are weak, AI
knowledge will not save the interview.

| | Data platform engineer | Data engineer | Analytics engineer | AI platform engineer |
|---|---|---|---|---|
| **Builds** | The shared platform: storage, compute, catalog, governance, tooling | Pipelines for specific domains and sources | Modelled, tested datasets for analytics | Model access, serving, evals and observability for AI teams |
| **Main tools** | Snowflake / Databricks, Iceberg, catalogs, orchestration, IaC | Spark, Airflow, CDC tools, Python, SQL | dbt, SQL, BI tools, semantic layers | Kubernetes, gateways, inference engines, OpenTelemetry |
| **Judged on** | Reliability, cost, governance, self-service adoption | Freshness, correctness, pipeline uptime | Trusted metrics, model quality | Uptime, latency, cost per request |
| **Typical design question** | "Design a governed lakehouse for 30 teams" | "Design CDC from Postgres into the warehouse" | "Model subscriptions and churn" | "Design an LLM gateway" |
| **Guide** | This page | [Data Engineering Q&A](DataEngineering_Interview_QA.md) | [dbt Q&A](dbt_Interview_QA.md) | [AI Platform guide](Path_AI_Platform_Engineer.md) |

---

## The interview loop by company type

These are **common patterns**, not a description of any one company's current
process. Ask the recruiter whether SQL is live, in a shared pad, or a take-home,
and which warehouse the team runs.

### Frontier lab or model provider

Data platform roles here support training data, evaluation data and product
analytics at large scale. Expect a coding round (Python, sometimes Spark), a hard
SQL round, a large-scale data system design (for example a pipeline that
deduplicates and versions training data), and behavioural rounds. Data privacy
and lineage questions carry extra weight.

### Big tech

| Round | What it tests | Length |
|---|---|---|
| Recruiter screen | Scope and scale of past platforms | 30 min |
| SQL | Window functions, joins, deduplication, gaps and islands, live | 45–60 min |
| Coding | Python data manipulation, sometimes algorithms | 45–60 min |
| Data modelling | Grain, facts and dimensions, slowly changing dimensions | 45–60 min |
| Data system design | Batch and streaming pipeline at scale, with failure handling | 60 min |
| Behavioural | Ownership, cross-team work | 45 min |

Usually four to six rounds on the onsite.

### AI-native startup

Often one person owns the whole data stack. Expect a take-home (build a small
dbt project or pipeline from raw files, with tests), a review of it, a design
conversation about "where we are and where we need to be in a year", and founder
rounds. Questions on feeding a RAG system or an analytics agent from the
warehouse are common.

### Enterprise or consulting

Migration and governance dominate: moving from an on-premises warehouse to
Snowflake or Databricks, designing RBAC and masking for regulated data, cost
governance, and a presentation of a reference architecture. Platform
certifications are often valued.

---

## Scoring rubric: what "strong hire" sounds like

| Round | Strong hire at senior | Strong hire at staff |
|---|---|---|
| **SQL** | Correct window functions, MERGE and deduplication, quickly; checks edge cases (nulls, ties, late data) | Same, plus explains performance (pruning, join strategy) and how to test the query |
| **Data modelling** | States the grain first; correct facts and dimensions; handles SCD type 2 | Models for change: contracts, versioning, and how the model serves both BI and AI consumers |
| **Data system design** | Idempotent, restartable pipeline; batch vs streaming chosen with a reason; data quality checks | Starts from SLAs and consumers; cost model; catalog and lineage; open table format choice; migration plan |
| **Performance / cost** | Diagnoses a slow query from the profile; knows clustering, partitioning and warehouse sizing | Sets cost guardrails and ownership across teams; explains the trade-off between freshness and spend |
| **Governance and AI** | RBAC and masking applied correctly; knows why native AI avoids data egress | Designs one policy that holds across SQL, BI, RAG and agents, with audit |
| **Behavioural** | Clear incident and delivery stories | Stories of setting platform standards and driving adoption |

---

## The 20 questions you are most likely to get

### SQL and coding

1. Return each customer's latest order, with ties handled. →
   [SQL Q&A](SQL_Interview_QA.md)
2. Find sessions from an event stream (gaps and islands). →
   [SQL Q&A](SQL_Interview_QA.md)
3. Write an idempotent MERGE that applies a CDC feed with deletes. →
   [SQL Q&A](SQL_Interview_QA.md) ·
   [Data Engineering Q&A](DataEngineering_Interview_QA.md)
4. In Python, deduplicate and validate a large file without loading it all into
   memory. → [Python Q&A](Python_Interview_QA.md)

### Data modelling

5. Model orders, refunds and subscriptions. What is the grain of each table? →
   [Data Engineering Q&A](DataEngineering_Interview_QA.md)
6. Implement SCD type 2 for customers in dbt. →
   [dbt](../Technologies/dbt/index.md) · [dbt Q&A](dbt_Interview_QA.md)
7. How would you add data contracts between producers and the platform? →
   [dbt](../Technologies/dbt/index.md)

### Data system design

8. Design CDC from an operational database into the warehouse with under
   15 minutes of lag. → [Data Engineering Q&A](DataEngineering_Interview_QA.md)
9. Batch or streaming for this use case? Defend it. →
   [Databricks](../Technologies/databricks/index.md)
10. When would you choose Iceberg tables and a shared catalog over native tables?
    → [Snowflake](../Technologies/snowflake/index.md) ·
    [Databricks](../Technologies/databricks/index.md)
11. Migrate a legacy warehouse to Snowflake with no downtime for reporting. →
    [Data migration project](../Projects/data-migration/index.md)

### Performance and cost

12. A dashboard got ten times slower overnight. Walk me through it. →
    [Snowflake](../Technologies/snowflake/index.md) ·
    [Snowflake Q&A](Snowflake_Interview_QA.md)
13. A Spark job has one task that runs for an hour. What is happening? →
    [Databricks Q&A](Databricks_Interview_QA.md)
14. The warehouse bill doubled this month. Find out why and stop it. →
    [Cortex cost & observability](../Snowflake-Cortex/governance-cost-observability.md)

### Governance and AI on the platform

15. Design RBAC and masking for a table with PII used by analysts and an AI
    assistant. → [RBAC Model](../Enterprise/rbac/index.md) ·
    [Snowflake Cortex](../Snowflake-Cortex/index.md)
16. Design "ask your data in plain English" over structured and unstructured data.
    → [Cortex Analyst / Search / native RAG](../Snowflake-Cortex/analyst-search-rag.md) ·
    [Cortex system-design mock](../Snowflake-Cortex/system-design-mock.md)
17. How do you keep a vector index in sync with the source tables? →
    [Vector DB](../GenAI-Topics/vector-db/index.md) ·
    [RAG](../GenAI-Topics/rag/index.md)
18. How do you show lineage from a source table to an AI answer? →
    [Audit Logging](../Enterprise/audit-logging/index.md)

### Behavioural

19. Tell me about a data incident that reached a business user. →
    [Production Incident Interviews](Interview_Production_Incidents.md)
20. Tell me about getting teams to adopt a platform standard. →
    [Behavioral / STAR](Behavioral_STAR_Interview_QA.md)

---

## Common failure modes

- **Rehearsed answers that collapse under follow-up.** "We used SCD type 2" is
  fine until the interviewer asks what happens when two changes arrive in the
  same batch, or how a late-arriving record is handled. Know the edge cases of
  every pattern you name.
- **Not stating the grain.** Modelling without saying what one row means is the
  most common modelling fail.
- **Slow or sloppy SQL.** Missing ties, nulls or duplicates in a window-function
  answer.
- **Non-idempotent pipelines.** A rerun that double-counts is a design bug, not
  an operations issue.
- **Tool lists instead of reasons.** "Kafka, Spark, Airflow, dbt" is not a
  design. Say why each piece is there and what you would remove.
- **Ignoring cost.** No mention of warehouse sizing, auto-suspend, clustering
  cost or token spend.
- **Governance stops at the warehouse.** Masking that an AI assistant can bypass
  through a service account.

---

## The skills this guide builds

| Skill | Why it matters at this level | Where you build it |
|-------|------------------------------|--------------------|
| **Strong SQL & modelling** | The bar; window functions, grain, CDC, SCD | [SQL Q&A](SQL_Interview_QA.md) · [Data Engineering Q&A](DataEngineering_Interview_QA.md) |
| **Warehouse depth** | Architecture, performance, cost tuning | [Snowflake](../Technologies/snowflake/index.md) · [Databricks](../Technologies/databricks/index.md) |
| **Governed transformation** | Tested, documented, versioned ELT | [dbt](../Technologies/dbt/index.md) |
| **Native AI in the perimeter** | Cortex / Mosaic AI without data egress | [Snowflake Cortex](../Snowflake-Cortex/index.md) |
| **Governance & cost** | RBAC, masking, lineage, credit control | [Enterprise](../Enterprise/index.md) · [Cortex governance](../Snowflake-Cortex/governance-cost-observability.md) |

---

## 14-day plan

| Day | Focus | Do |
|---|---|---|
| 1 | Baseline | Add the job in OfferReady. Do questions 1, 5 and 12 out loud; note the gaps. |
| 2 | SQL | [SQL Q&A](SQL_Interview_QA.md): window functions, CTEs, MERGE, gaps and islands. Questions 1–3, timed. |
| 3 | Pipelines | [Data Engineering Q&A](DataEngineering_Interview_QA.md): CDC, SCD, batch vs streaming, idempotency. |
| 4 | Snowflake | [Snowflake](../Technologies/snowflake/index.md): storage and compute separation, micro-partitions and pruning, Streams and Tasks, Time Travel, cost tuning. |
| 5 | Databricks | [Databricks](../Technologies/databricks/index.md): Spark internals (shuffle, joins, AQE), Delta and liquid clustering, Unity Catalog, Lakeflow Declarative Pipelines (formerly DLT). |
| 6 | dbt | [dbt](../Technologies/dbt/index.md): materialisations, incremental strategies (including microbatch), tests, contracts, slim CI. |
| 7 | Mock 1 | Voice mock with a data system design round (question 8). List every follow-up you missed. |
| 8 | Modelling | Questions 5–7 on a whiteboard. State the grain first, every time. |
| 9 | Performance & cost | Questions 12–14 using the Query Profile and Spark UI stories from the platform pages. |
| 10 | Native AI | [Snowflake Cortex](../Snowflake-Cortex/index.md) and [Analyst / Search / native RAG](../Snowflake-Cortex/analyst-search-rag.md): why AI next to governed data. |
| 11 | Governance | [Cortex security, cost & observability](../Snowflake-Cortex/governance-cost-observability.md), [Enterprise](../Enterprise/index.md), [RBAC](../Enterprise/rbac/index.md): questions 15 and 18. |
| 12 | Design end to end | [Cortex system-design mock](../Snowflake-Cortex/system-design-mock.md) and one [Production Incident](Interview_Production_Incidents.md). |
| 13 | Mock 2 | Voice mock with Deep follow-ups on, then two STAR stories (incident, adoption). |
| 14 | Light review | [Snowflake Q&A](Snowflake_Interview_QA.md), [Databricks Q&A](Databricks_Interview_QA.md), [Cheat Sheets](Interview_Cheat_Sheets.md), rest. |

---

## Are you ready? (self-check)

- [ ] I write correct window-function / MERGE / CDC SQL quickly.
- [ ] I can explain warehouse architecture and diagnose a slow query.
- [ ] I can tie cost to its drivers (compute/DBUs, tokens × model tier) and control it.
- [ ] I build governed, tested, incremental transformations (dbt).
- [ ] I can explain native AI (Cortex/Mosaic) and why it avoids data egress.
- [ ] I apply RBAC, masking, and lineage across both data and the AI path.
- [ ] I can explain when open table formats (Iceberg) and a shared catalog beat native tables.

If most boxes are checked, you're solid on the data platform side. To push
toward **staff / principal**, add build-vs-buy, cost economics, and org
governance. See the [Staff / Principal guide](Path_Staff_Principal_Architect.md).

---

## Practise this in OfferReady

[:material-briefcase-plus: Add a job](https://klnjoy.github.io/offerready-app/analyze){ .md-button .md-button--primary target=_blank rel=noopener }
[:material-microphone: Voice mock](https://klnjoy.github.io/offerready-app/interview/voice){ .md-button target=_blank rel=noopener }
[:material-dumbbell: Practice questions](https://klnjoy.github.io/offerready-app/practice){ .md-button target=_blank rel=noopener }

- **Add a job** reads the job description and builds a plan around your gaps.
- **Voice mock** runs a spoken interview. Turn on **Deep follow-ups** to be
  pushed on edge cases, and use the **whiteboard** in the system-design round to
  draw the pipeline and the model.
- **Practice** gives you scored questions for this role, one at a time.

!!! note "Related role guides"
    [AI Engineer](Path_AI_Engineer.md) ·
    [AI Platform Engineer](Path_AI_Platform_Engineer.md) ·
    [Forward Deployed Engineer](Path_FDE.md) ·
    [Staff / Principal AI Architect](Path_Staff_Principal_Architect.md) ·
    [Interview Guide overview](Interview_Guide_Overview.md)
