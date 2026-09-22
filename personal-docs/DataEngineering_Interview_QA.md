---
icon: material/pipe
---

# Data Engineering Interview Q&A — System Design & Scenarios

Senior data-engineering questions focused on **pipeline and system design**:
batch vs streaming, CDC, idempotency, data quality, schema evolution, and
end-to-end architecture. Study at a glance, then open each question for depth.

!!! tip "How to use this page"
    Skim the **60-second talking points** and **rapid-fire** for recall, then
    drill into the design questions. Finish with the **self-quiz**.
    Related: [SQL](SQL_Interview_QA.md) · [Snowflake](Snowflake_Interview_QA.md) ·
    [Databricks](Databricks_Interview_QA.md) · [AWS](AWS_Interview_QA.md).

---

## Study checklist

Can you explain each without notes?

- [ ] ETL vs ELT and why ELT dominates modern warehouses
- [ ] Batch vs streaming vs micro-batch trade-offs
- [ ] CDC approaches (log-based vs query-based)
- [ ] Idempotency and exactly-once vs at-least-once
- [ ] Backfills and reprocessing safely
- [ ] Schema evolution / drift handling
- [ ] Data quality checks and where they go
- [ ] Partitioning and file sizing
- [ ] Orchestration + dependency/retry design
- [ ] Medallion / layered architecture

---

## 60-second talking points

- **"ELT over ETL: load raw, transform in the warehouse."** Cheap storage +
  elastic compute make in-warehouse transforms simpler and reprocessable.
- **"Idempotent by design."** Upserts on keys, atomic swaps, checkpoints — so any
  step can safely re-run.
- **"Ground data quality in tests, not hope."** Freshness, uniqueness,
  referential, volume checks — gated in CI/pipeline.

---

## Core concepts — simple, then the nuance

??? note "ETL vs ELT: explain it simply, then go deep"
    **Simple:** ETL transforms data *before* loading; ELT loads raw first, then
    transforms *inside* the warehouse.

    **The nuance:** ELT wins in cloud warehouses because storage is cheap and compute
    is elastic — you keep raw data (reprocessable), push transforms to SQL (dbt),
    and get lineage/tests for free. ETL still fits when you must transform/mask
    before landing (compliance) or when the target can't transform. Modern default:
    ELT with a layered (bronze/silver/gold) model.

??? note "Idempotency: simple, then deep"
    **Simple:** Running a step twice produces the same result as running it once —
    no duplicates, no double-counting.

    **The nuance:** Achieve it with **upserts/MERGE** keyed on a natural or hash key
    (not blind INSERT), **atomic** writes (write temp → swap), **checkpoints**, and
    **idempotency keys** for external side effects. It's what makes retries and
    backfills safe. Distinguish **at-least-once** (may duplicate → need idempotent
    sink) from **exactly-once** (checkpoint + idempotent sink together).

---

## Pipeline design

=== "CDC → current + history"

    ```text
    source → CDC (log-based) → landing (raw, append)
      → MERGE upsert → CURRENT table (latest per key)
      → archive prior versions → HISTORY table (timestamped)
    query: current for ops, history for audit, view/UNION for full picture
    ```

=== "Data quality gates"

    ```text
    ingest → [freshness check] → transform
      → [unique/not-null/relationship tests] → publish
      → [volume/anomaly check] → BI
    fail closed on critical checks; warn on soft ones; DLQ bad records
    ```

!!! example "Worked scenario: design an Oracle → warehouse near-real-time pipeline"
    **Requirements:** low-latency sync, keep history, survive retries.

    **Design:**
    1. **Extract:** log-based **CDC** (not full-table query) to capture inserts/
       updates/deletes with low source load.
    2. **Land:** raw change events append to a staging table (bronze).
    3. **Merge:** a scheduled job **MERGEs** latest per key into a **current-state**
       table; prior versions archived to a **timestamped history** table (SCD2).
    4. **Idempotent:** keyed upserts + checkpoints so re-runs don't duplicate.
    5. **Quality:** uniqueness/freshness tests gate publish; bad records to a DLQ.
    6. **Serve:** current for operational queries, history for audit, a view for the
       full set. Tag history for compliance.

    **Talking point:** "Log-based CDC + idempotent MERGE + current/history split is
    the reusable backbone — latency and tooling vary, the shape doesn't."

??? question "ETL vs ELT — which and why?"
    **ELT** by default in modern warehouses: land raw, transform in-warehouse (dbt),
    keep reprocessable raw data with lineage and tests. **ETL** when you must
    transform/mask before landing (compliance) or the target can't transform. The
    shift is driven by cheap storage + elastic compute.

??? question "Batch vs streaming vs micro-batch — how do you choose?"
    **Batch**: simplest, highest latency, cheapest — nightly/hourly loads.
    **Streaming**: lowest latency, most complex (state, ordering, exactly-once) —
    real-time needs. **Micro-batch**: small frequent batches, a pragmatic middle
    (e.g. every few minutes). Choose by the **actual latency requirement** — don't
    build streaming for data consumed once a day.

??? question "Log-based vs query-based CDC?"
    **Log-based** reads the DB transaction log — low source load, captures deletes,
    near-real-time; needs log access/tooling. **Query-based** polls with a
    watermark column (`updated_at`) — simpler, but misses hard deletes, adds source
    load, and can miss rows without a reliable timestamp. Prefer log-based for
    fidelity and low impact where available.

??? question "How do you make a pipeline idempotent and retry-safe?"
    Keyed **upsert/MERGE** (not blind insert); **atomic** writes (temp then swap);
    **checkpoint** progress; **idempotency keys** for external side effects; and a
    **DLQ** for poison records. Then retries with backoff and backfills are safe and
    won't duplicate or corrupt.

??? question "How do you run a backfill without breaking prod or double-counting?"
    Backfill into a **separate/partitioned target** or use idempotent upserts so
    re-processing a window overwrites rather than appends. Bound the backfill to
    specific partitions/date ranges, run on an isolated warehouse to avoid
    contention, validate row counts against the source, then swap/merge in. Never
    blind-insert a backfill into a live append-only table.

---

## Quality, schema, scale

??? question "What data-quality checks do you build, and where?"
    **Freshness** (is upstream current?), **uniqueness/not-null** on keys,
    **referential** (FK relationships), **accepted values/ranges**, and **volume/
    anomaly** (row count within expected bounds). Put them at layer boundaries
    (source → staging → marts), run in CI on PRs and in the pipeline; **fail closed**
    on critical checks, warn on soft ones, and DLQ bad records.

??? question "How do you handle schema evolution / drift?"
    Prefer **additive** changes (new nullable columns) and explicit contracts so
    breaking changes fail fast. Handle new columns with `on_schema_change` (dbt) or
    schema-merge (Delta). Version schemas, decouple producers/consumers with a
    contract, and keep raw data so you can reprocess when the schema changes. Alert
    on unexpected drift rather than silently absorbing it.

??? question "How do you decide partitioning and file sizing?"
    Partition on a **low-cardinality, frequently-filtered** column (usually date) —
    enough to prune, not so much you create the small-file problem. Target file/
    partition sizes around **100 MB–1 GB** (columnar). Compact small files
    (OPTIMIZE) and avoid over-partitioning. Align partitioning with the dominant
    query filter and the write cadence.

??? question "Design orchestration for a DAG with retries and dependencies."
    Model tasks as a **DAG** with explicit dependencies (Airflow/Dagster/dbt/Step
    Functions). Each task: **idempotent**, with **retries + backoff**, timeouts,
    and clear success criteria. Trigger on schedule or upstream completion (or data
    availability/sensors). Isolate failures (one branch failing shouldn't corrupt
    others), alert on SLA misses, and make reruns safe.

---

## Rapid-fire

| Q | A |
|---|---|
| ETL vs ELT? | transform-before-load vs load-raw-then-transform (ELT default) |
| Idempotent write? | keyed upsert/MERGE + atomic swap |
| At-least-once needs? | an idempotent sink to dedupe |
| Log vs query CDC? | log = low-impact, captures deletes; query = simpler, misses deletes |
| Poison record? | route to DLQ, keep processing |
| Small-file fix? | compact (OPTIMIZE), control write parallelism |
| Freshness check? | is upstream data current enough to publish |
| Backfill safely? | partitioned/idempotent target, validate counts |
| Medallion layers? | bronze (raw) → silver (clean) → gold (marts) |
| Partition on? | low-cardinality frequent filter (usually date) |

---

## Pitfalls interviewers probe

- Blind INSERTs → duplicates on retry/backfill.
- Building streaming for data consumed daily (needless complexity).
- Query-based CDC missing hard deletes.
- No data-quality gates → bad data reaches BI.
- Over-partitioning → small-file problem.
- No DLQ/idempotency → fragile, un-rerunnable pipelines.

---

## Self-quiz

1. Design an Oracle → warehouse near-real-time pipeline with history.
2. ETL vs ELT — justify a choice for a given constraint.
3. Batch vs streaming vs micro-batch — pick one and defend it.
4. Make a pipeline idempotent — what concretely do you do?
5. Run a safe backfill without double-counting.
6. What quality checks, and where do they run?
7. Handle a breaking schema change from an upstream team.
8. Choose partitioning + file sizing for a large fact table.

!!! note "Cross-links"
    Related: [SQL](SQL_Interview_QA.md) · [Snowflake](Snowflake_Interview_QA.md) ·
    [Databricks](Databricks_Interview_QA.md) · [AWS](AWS_Interview_QA.md) ·
    [dbt](dbt_Interview_QA.md)
