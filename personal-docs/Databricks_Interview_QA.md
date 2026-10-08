---
icon: material/database
---

# Databricks Interview Q&A — Advanced & Scenario-Based

*Last reviewed: October 2026*

Senior lakehouse questions: Spark performance, Delta Lake internals, data skew,
Unity Catalog governance, and streaming. Study at a glance, then open each
question for depth.

!!! tip "How to use this page"
    Skim the **60-second talking points** and **rapid-fire** for recall, then
    drill into the collapsible questions. Finish with the **self-quiz**.
    Deep dive: [Technologies → Databricks](../Technologies/databricks/index.md).

---

## Study checklist

Can you explain each without notes?

- [ ] Lakehouse = lake storage + warehouse semantics (what Delta adds)
- [ ] Lazy transformations vs actions, and the DAG
- [ ] What a shuffle is and why it's the expensive part
- [ ] Data skew: how to spot it and three fixes
- [ ] Broadcast join, salting, AQE
- [ ] Delta transaction log → ACID, time travel, MERGE
- [ ] The small-file problem, OPTIMIZE, ZORDER, VACUUM
- [ ] Partitioning vs Z-order vs liquid clustering
- [ ] Structured Streaming: checkpoints, watermarks, exactly-once
- [ ] Unity Catalog: what it centralizes (incl. Iceberg/open access)
- [ ] Lakeflow Declarative Pipelines (formerly DLT) and Lakeflow Jobs
- [ ] Building and evaluating agents on Databricks (Mosaic AI)

---

## 60-second talking points

- **"Lakehouse = data lake storage + warehouse semantics."** Delta Lake adds ACID
  transactions, schema enforcement, and time travel on cheap object storage.
- **"Spark is lazy; actions trigger execution."** Transformations build a DAG;
  the shuffle is where performance is won or lost.
- **"Unity Catalog is the single governance plane."** One place for access,
  lineage, and discovery across workspaces.

---

## Core concepts — simple, then the nuance

??? note "Lazy evaluation & the DAG: simple, then deep"
    **Simple:** Spark doesn't do anything when you write `filter`/`select`
    (transformations). It only runs when you call an **action** (`count`,
    `write`, `collect`). Until then it's just building a plan.

    **The nuance:** The plan is a DAG of stages split at **shuffle boundaries**.
    Catalyst optimizes it (predicate/projection pushdown), and with **AQE** it can
    re-plan at runtime (coalesce partitions, handle skew joins, switch join
    strategies) using actual stage statistics. Understanding stage boundaries is how
    you read the Spark UI and find the expensive shuffle.

??? note "Shuffle: simple, then deep"
    **Simple:** A shuffle is Spark **moving data between machines** so related rows
    land together — needed for joins, groupBy, distinct. It's slow because it writes
    to disk and crosses the network.

    **The nuance:** Wide transformations force a shuffle; narrow ones don't. You
    minimize shuffles by broadcasting small tables, pre-partitioning/bucketing,
    filtering/pre-aggregating before the shuffle, and reducing the number of wide
    ops. Skew makes one shuffle partition huge, so one task lags while others idle.

---

## Spark performance

=== "Diagnose from the Spark UI"

    ```text
    Stages tab → find the long stage
    → skew?   one task's shuffle-read / duration >> the others
    → spill?  memory/disk spill columns > 0
    → tasks?  too few = under-parallelized; too many = overhead
    → join?   SortMergeJoin on a huge side that could be broadcast
    ```

=== "Fix skew: salting"

    ```python
    from pyspark.sql import functions as F
    # Spread a hot key across N buckets before the join
    N = 16
    df  = df.withColumn("salt", (F.rand()*N).cast("int"))
    dim = dim.crossJoin(spark.range(N).withColumnRenamed("id","salt"))
    joined = df.join(dim, ["key","salt"])
    ```

=== "Broadcast a small dimension"

    ```python
    from pyspark.sql.functions import broadcast
    fact.join(broadcast(small_dim), "key")   # avoids the shuffle entirely
    ```

=== "Enable AQE"

    ```python
    spark.conf.set("spark.sql.adaptive.enabled", True)
    spark.conf.set("spark.sql.adaptive.skewJoin.enabled", True)
    spark.conf.set("spark.sql.adaptive.coalescePartitions.enabled", True)
    ```

!!! example "Worked scenario: job fine on sample, hangs at full scale"
    **Symptom:** Passes on 1% sample, hangs on full data at a join stage.

    **Reasoning:**
    1. **Spark UI → the join stage:** one task reads far more shuffle data and runs
       for minutes while the rest finished in seconds → **skew** on a hot join key.
    2. **Cheapest fix first:** enable **AQE skew join** (runtime split of the hot
       partition). If the small side fits memory, **broadcast** it to skip the
       shuffle entirely.
    3. **If still skewed:** **salt** the hot key to spread it across partitions.
    4. **Also check** partition sizing (target ~100–200 MB) and any spill.

    **Outcome:** "At scale, the usual culprit is skew in a shuffle — I'd confirm in
    the UI, try AQE/broadcast, then salt if needed."

??? question "A Spark job runs fine on sample data but hangs at scale. Diagnose."
    Almost always **data skew** in a shuffle (join or groupBy on a hot key). Open
    the Spark UI: one task processes far more than the others. Fixes: **salt** the
    skewed key, **broadcast** the smaller side to avoid the shuffle, enable **AQE**
    (skew-join handling + partition coalescing), or filter/pre-aggregate the hot key
    separately.

??? question "What is a shuffle and why is it expensive?"
    A shuffle redistributes data across partitions/executors (needed for wide
    transformations). It writes to disk and moves data over the network — the most
    expensive operation in Spark. Minimize shuffles: broadcast small tables,
    pre-partition/bucket, push filters/projections down, reduce wide ops.

??? question "How do you tune partition count?"
    Too few → under-parallelized, spills, OOM. Too many → scheduling overhead and
    tiny files. Target ~100–200 MB per partition. Use `repartition`/`coalesce`
    deliberately (coalesce avoids a full shuffle when reducing) and let **AQE**
    coalesce post-shuffle partitions. Control write parallelism to avoid small
    files.

??? question "`cache`/`persist` — when does it help (or hurt)?"
    Helps when a DataFrame is **reused multiple times** (iterative ML, branching
    pipelines). Hurts when used once (wasted memory) or when it evicts other useful
    data. Always `unpersist` when done. For a single linear pipeline, caching adds
    no value.

??? question "SortMergeJoin vs BroadcastHashJoin — when does each apply?"
    **BroadcastHashJoin**: one side small enough to ship to every executor — no
    shuffle, fast. Spark/AQE picks it automatically under a size threshold.
    **SortMergeJoin**: both sides large — both get shuffled and sorted on the key.
    If a join is slow, check whether a broadcast is possible (or raise the
    threshold), and watch for skew in the sort-merge path.

---

## Delta Lake

=== "Maintenance"

    ```sql
    OPTIMIZE sales ZORDER BY (customer_id);   -- compact + cluster (pre-liquid tables)
    ALTER TABLE sales CLUSTER BY (customer_id); -- liquid clustering (or CLUSTER BY AUTO)
    OPTIMIZE sales;                           -- on liquid tables: incremental clustering
    VACUUM sales RETAIN 168 HOURS;            -- reclaim old files past retention
    DESCRIBE HISTORY sales;                   -- audit versions
    RESTORE TABLE sales TO VERSION AS OF 42;  -- roll back a bad write
    ```

??? question "How does Delta give ACID on object storage?"
    A **transaction log** (`_delta_log`) records ordered JSON commits describing
    which Parquet files are added/removed. Readers reconstruct table state from the
    log (with periodic checkpoints), giving snapshot isolation and atomic commits
    even though the underlying files are immutable. This enables time travel,
    `MERGE`, and concurrent writes via optimistic concurrency.

??? question "You have millions of tiny files and reads are slow. Fix it."
    The **small-file problem**. Run `OPTIMIZE` to compact (and `ZORDER BY`
    high-cardinality filter columns for data skipping). Prevent recurrence: control
    write parallelism, use optimized writes / auto-optimize, partition sensibly.
    `VACUUM` old files after retention to reclaim storage.

??? question "Partitioning vs Z-ordering vs liquid clustering?"
    **Partitioning** physically splits by a low-cardinality column (date) — good for
    pruning but over-partitioning creates small files. **Z-ordering** co-locates
    related data across multiple columns for skipping within files. **Liquid
    clustering** (`CLUSTER BY`) is the current recommendation for new tables: it
    replaces both partitioning and Z-order, clusters incrementally, and lets you
    change keys without rewriting the table. With `CLUSTER BY AUTO` plus
    **predictive optimization** on Unity Catalog managed tables, Databricks picks
    keys from query patterns and runs OPTIMIZE/VACUUM for you. Liquid clustering
    and Z-order/partitioning are mutually exclusive on a table.

??? question "How does time travel work and when do you use it?"
    Delta keeps versioned commits, so you can query `VERSION AS OF` / `TIMESTAMP AS
    OF` to read past state, audit changes, or roll back a bad write with `RESTORE`.
    Retention is bounded by `VACUUM` — once vacuumed, old versions are gone.

??? question "Two jobs write the same Delta table concurrently. What happens?"
    Delta uses **optimistic concurrency**: each writer reads a snapshot, does its
    work, and commits by appending to the log. If another commit landed first that
    conflicts (overlapping files), the later writer's commit fails and it must
    retry against the new snapshot. Non-conflicting appends succeed. With
    **deletion vectors** and **row-level concurrency** (Databricks Runtime 14.2+
    on liquid-clustered or unpartitioned tables), concurrent MERGE/UPDATE/DELETE on
    *different rows* of the same files no longer conflict. Design writers to be
    retry-safe anyway.

---

## Streaming & pipelines

??? question "Structured Streaming: how do you get exactly-once and handle late data?"
    **Checkpointing** + idempotent sinks (Delta) give exactly-once. Use
    **watermarks** to bound state and drop data later than the threshold for
    windowed aggregations. Choose the right output mode (append/update/complete) and
    trigger interval for the latency/cost trade-off.

??? question "What are Delta Live Tables / declarative pipelines for?"
    Declarative pipeline framework: define streaming tables and materialized views
    (bronze/silver/gold) with quality **expectations**, and the framework manages
    orchestration, incremental processing, retries, and lineage. Less orchestration
    code than hand-rolled jobs, with built-in data-quality enforcement. **Naming
    note:** DLT was rebranded in 2025 as **Lakeflow Declarative Pipelines** (docs now
    say "Lakeflow pipelines"), and the core API was contributed to Apache Spark as
    **Spark Declarative Pipelines** (Spark 4.1+). New Python code uses
    `from pyspark import pipelines as dp`; `import dlt` still works. Workflows are
    now **Lakeflow Jobs**, and managed ingestion is **Lakeflow Connect**.

??? question "Explain the medallion (bronze/silver/gold) architecture."
    **Bronze** = raw ingested data (append-only, schema-on-read). **Silver** =
    cleaned, conformed, deduplicated, joined. **Gold** = business-level aggregates/
    marts for BI and ML. It gives clear layering, reprocessing points, and quality
    gates between stages.

---

## Governance

??? question "What does Unity Catalog give you over workspace-local access control?"
    A **centralized** governance layer across workspaces: three-level namespace
    (`catalog.schema.table`), fine-grained grants, automated **column/row-level**
    security, **data lineage**, audit, and discovery. Access is consistent
    everywhere instead of per-workspace ACLs. It also governs ML models, volumes,
    functions and AI agents/tools. Unity Catalog is open source, exposes tables to
    external engines through an Iceberg REST catalog interface, and can federate
    external catalogs (Hive metastore, Glue, Snowflake Horizon).

??? question "How would you build and evaluate a GenAI agent on Databricks?"
    Data and tools live in Unity Catalog (tables, Vector Search indexes, UC
    functions as tools, MCP servers). Build the agent with any framework
    (LangGraph, OpenAI Agents SDK, plain Python) via the **Mosaic AI Agent
    Framework**, or use **Agent Bricks** for common patterns (knowledge assistant,
    information extraction, multi-agent supervisor) that auto-generate evals. Log
    and version it with **MLflow 3**, evaluate with MLflow's GenAI evaluation (LLM
    judges plus custom scorers on a labeled set), deploy to **Model Serving**, and
    route model calls through **AI Gateway** for rate limits, guardrails, usage
    tracking and inference tables. Production traces flow back into MLflow so
    failures become new eval cases.

??? question "Databricks vs Snowflake — how do you frame the choice?"
    Databricks leads for **Spark/ML, unstructured data, and code-heavy data
    engineering** on open Delta format. Snowflake leads for **SQL analytics, ease of
    operations, and near-zero tuning**. They overlap heavily now (Snowpark and
    Iceberg tables on one side; Databricks SQL serverless warehouses, Unity Catalog
    Iceberg support and Lakebase Postgres on the other).
    Choose on workload center of gravity, existing skills, and openness vs
    managed-simplicity — not a feature checklist.

---

## Rapid-fire

| Q | A |
|---|---|
| Transformation vs action? | transformation lazy (builds DAG); action triggers execution |
| `repartition` vs `coalesce`? | repartition = full shuffle; coalesce = merge partitions, no full shuffle |
| Broadcast join when? | one side fits in memory → avoids shuffle |
| `OPTIMIZE`? | compacts small Delta files (+ ZORDER for skipping) |
| `VACUUM`? | deletes old unreferenced files past retention |
| Watermark? | bounds streaming state; drops late data past threshold |
| AQE? | Adaptive Query Execution — runtime skew/partition/join optimization |
| Bronze/silver/gold? | raw → cleaned/conformed → business aggregates |
| Delta concurrency model? | optimistic — conflicting commit retries |
| Target partition size? | ~100–200 MB |
| DLT's current name? | Lakeflow Declarative Pipelines (Spark Declarative Pipelines in OSS) |
| New-table layout default? | liquid clustering (`CLUSTER BY` / `CLUSTER BY AUTO`) |

---

## Pitfalls interviewers probe

- Ignoring data skew until the job hangs at scale.
- Over-partitioning creating the small-file problem.
- Caching data used only once (wasted memory).
- Forgetting `VACUUM`/`OPTIMIZE` maintenance on Delta tables.
- Treating time travel as infinite (VACUUM removes old versions).
- Broadcasting a table that's actually too big → driver OOM.

---

## Self-quiz

1. A job hangs at a join stage at scale — how do you diagnose and fix it?
2. Explain how Delta provides ACID on immutable object storage.
3. You have millions of tiny files — what commands fix and prevent it?
4. When would you pick liquid clustering over partitioning?
5. How do you get exactly-once in Structured Streaming?
6. What does Unity Catalog centralize that workspace ACLs don't?
7. Broadcast vs sort-merge join — when does each apply?
8. What happens when two jobs write the same Delta table at once?
9. How do you evaluate an agent before promoting it to Model Serving?

!!! note "Cross-links"
    Deep dive: [Technologies → Databricks](../Technologies/databricks/index.md) ·
    Related: [Snowflake Interview Q&A](Snowflake_Interview_QA.md) ·
    [dbt Interview Q&A](dbt_Interview_QA.md)
