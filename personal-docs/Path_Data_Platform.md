---
icon: material/database-cog
---

# Path: Data & AI / Platform Engineer

A curated preparation path for **Data & AI / Platform Engineer** interviews —
roles where you own the data and platform side of AI systems: warehousing, ELT,
governance, and the native-AI features that run next to the data. This page is
your *plan*; it routes into existing pages rather than repeating them.

!!! abstract "What this level is really testing"
    **Can you build and govern the data platform that AI runs on?** Correct SQL
    and pipelines, sound modeling, cost/performance tuning, governance (RBAC,
    masking, lineage), and how native AI (Cortex, Mosaic AI) fits inside the
    governance boundary. Depth on data engineering beats GenAI breadth here.

    See [Senior / Staff / Principal / FDE](Interview_Level_Comparison.md) for what
    interviewers listen for at each level.

---

## The 5 skills this path builds

| Skill | Why it matters at this level | Where you build it |
|-------|------------------------------|--------------------|
| **Strong SQL & modeling** | The bar; window functions, grain, CDC, SCD | [SQL Q&A](SQL_Interview_QA.md) · [Data Engineering Q&A](DataEngineering_Interview_QA.md) |
| **Warehouse depth** | Architecture, performance, cost tuning | [Snowflake](../Technologies/snowflake/index.md) · [Databricks](../Technologies/databricks/index.md) |
| **Governed transformation** | Tested, documented, versioned ELT | [dbt](../Technologies/dbt/index.md) |
| **Native AI in the perimeter** | Cortex / Mosaic AI without data egress | [Snowflake Cortex](../Snowflake-Cortex/index.md) |
| **Governance & cost** | RBAC, masking, lineage, credit control | [Enterprise](../Enterprise/index.md) · [Cortex governance](../Snowflake-Cortex/governance-cost-observability.md) |

---

## Study order (about 2 weeks)

Work top to bottom. Each step notes **what to emphasize**.

### Week 1 — SQL, warehouses & transformation

1. **[SQL Interview Q&A](SQL_Interview_QA.md)** — window functions, CTEs, MERGE,
   grain; be fast and correct.
2. **[Data Engineering Q&A](DataEngineering_Interview_QA.md)** — pipelines, CDC,
   SCD, batch vs streaming, idempotency.
3. **[Snowflake](../Technologies/snowflake/index.md)** — architecture (storage/
   compute separation), micro-partitions/pruning, Streams & Tasks, Time Travel,
   performance + cost tuning.
4. **[Databricks](../Technologies/databricks/index.md)** — Lakehouse, Spark
   internals (shuffle, joins, AQE), Delta, Unity Catalog; emphasize the
   shuffle/skew and DBU-cost stories.
5. **[dbt](../Technologies/dbt/index.md)** — models, materializations,
   incremental strategies, tests/contracts, slim CI.

### Week 2 — Native AI, governance & scenarios

6. **[Snowflake Cortex](../Snowflake-Cortex/index.md)** — Cortex AI, Agents,
   Analyst (semantic views), Search (native RAG); why "AI next to governed data."
7. **[Cortex Analyst / Search / native RAG](../Snowflake-Cortex/analyst-search-rag.md)** —
   the structured + unstructured story.
8. **[Cortex security, cost & observability](../Snowflake-Cortex/governance-cost-observability.md)** —
   RBAC/masking in the AI path, credit control, monitoring, incidents.
9. **[Enterprise](../Enterprise/index.md)** (RBAC, audit, compliance) — the
   governance layer that spans data + AI.
10. **[Requirements → Production](Interview_Requirements_to_Production.md)** +
    **[Production Incident Interviews](Interview_Production_Incidents.md)** —
    drive a data-platform design and a data/cost incident end to end.

---

## Drills that move the needle

- **SQL drill:** write window-function and MERGE/CDC queries cold from
  [SQL Q&A](SQL_Interview_QA.md).
- **Perf drill:** given "a dashboard got 10× slower," walk the Snowflake Query
  Profile or Spark UI diagnosis (pruning/clustering, skew/spill) from the
  [Snowflake](../Technologies/snowflake/index.md) / [Databricks](../Technologies/databricks/index.md) pages.
- **Cost drill:** "the Cortex/warehouse bill doubled overnight" — diagnose →
  mitigate → prevent using
  [Cortex cost & observability](../Snowflake-Cortex/governance-cost-observability.md).
- **Native-RAG drill:** design "ask your enterprise data" over structured +
  unstructured with governance, from the
  [Cortex system-design mock](../Snowflake-Cortex/system-design-mock.md).
- **Q&A banks:** [Snowflake](Snowflake_Interview_QA.md) ·
  [Databricks](Databricks_Interview_QA.md) · [dbt](dbt_Interview_QA.md) ·
  [Python](Python_Interview_QA.md).
- **Full run:** [Master Interview Simulator](Interview_Master_Simulator.md) +
  [Master Cheat Sheets](Interview_Cheat_Sheets.md).

---

## Are you ready? (self-check)

- [ ] I write correct window-function / MERGE / CDC SQL quickly.
- [ ] I can explain warehouse architecture and diagnose a slow query.
- [ ] I can tie cost to its drivers (compute/DBUs, tokens × model tier) and control it.
- [ ] I build governed, tested, incremental transformations (dbt).
- [ ] I can explain native AI (Cortex/Mosaic) and why it avoids data egress.
- [ ] I apply RBAC, masking, and lineage across both data and the AI path.

If most boxes are checked, you're solid on the data/platform side. To push toward
**Staff/Principal**, add build-vs-buy, cost economics, and org governance — see
the [Staff / Principal path](Path_Staff_Principal_Architect.md).

!!! note "Related paths"
    [AI / GenAI Engineer path](Path_AI_Engineer.md) ·
    [Staff / Principal Architect path](Path_Staff_Principal_Architect.md) ·
    [Forward Deployed Engineer path](Path_FDE.md) ·
    [Interview Guide overview](Interview_Guide_Overview.md)
