---
icon: material/cube-outline
---

# dbt Interview Q&A — Advanced & Scenario-Based

*Last reviewed: October 2026*

Senior analytics-engineering questions on dbt: incremental models, testing,
project structure, performance, and how dbt fits a governed warehouse. Study at a
glance, then open each question for depth.

!!! tip "How to use this page"
    Skim the **60-second talking points** and **rapid-fire** for recall, then
    drill into the collapsible questions. Finish with the **self-quiz**.
    Deep dive: [Technologies → dbt](../Technologies/dbt/index.md).

---

## Study checklist

Can you explain each without notes?

- [ ] dbt's role in ELT (the "T"), and what `ref()` gives you
- [ ] View vs table vs incremental materialization
- [ ] Incremental strategies + late-arriving data handling
- [ ] `on_schema_change` behavior
- [ ] Data tests (generic/singular) vs unit tests (dbt 1.8+)
- [ ] The `microbatch` incremental strategy (dbt 1.9+)
- [ ] Model contracts and why they help
- [ ] Snapshots (SCD2)
- [ ] Project layering (staging / intermediate / marts)
- [ ] State selection (`state:modified+`) in CI
- [ ] dbt + warehouse governance interplay

---

## 60-second talking points

- **"dbt is the T in ELT."** SQL transformations, version-controlled, tested, and
  documented — raw tables become trusted models with lineage.
- **"Models are just SELECTs; dbt handles the DDL."** You write the query, dbt
  materializes it and wires dependencies via `ref`.
- **"Tests + contracts make the warehouse trustworthy."** Breakage is caught in CI,
  not in the dashboard.

---

## Core concepts — simple, then the nuance

??? note "`ref()` and the DAG: explain it simply, then go deep"
    **Simple:** Instead of writing a table name, you write `{{ ref('model') }}`.
    dbt then knows model B depends on model A and builds them in order.

    **The nuance:** `ref()` builds the dependency **DAG**, which powers run
    ordering, `--select`/`state:` selection (build only what changed + downstream),
    environment-aware schema swapping (dev vs prod), and lineage/docs. Hardcoding a
    table name breaks all of that. `source()` does the same for raw external tables
    and adds freshness checks.

??? note "Incremental models: simple, then deep"
    **Simple:** Instead of rebuilding the whole table each run, only process new or
    changed rows.

    **The nuance:** You guard the new-rows filter with `is_incremental()` and a
    watermark; on full-refresh it rebuilds. The hard parts are **late-arriving data**
    (use a lookback window), a truly **unique key** for merge, and **schema drift**
    (`on_schema_change`). Only adopt incremental when full refresh is genuinely too
    slow/expensive — it trades simplicity for speed.

---

## Materializations

=== "Incremental (merge)"

    ```sql
    {{ config(materialized='incremental', unique_key='order_id',
              incremental_strategy='merge',
              on_schema_change='append_new_columns') }}

    SELECT order_id, customer_id, amount, updated_at
    FROM {{ ref('stg_orders') }}
    {% if is_incremental() %}
      -- lookback window catches late-arriving rows
      WHERE updated_at > (SELECT DATEADD('hour', -3, MAX(updated_at)) FROM {{ this }})
    {% endif %}
    ```

=== "Microbatch (dbt 1.9+)"

    ```sql
    {{ config(materialized='incremental', incremental_strategy='microbatch',
              event_time='event_at', batch_size='day',
              begin='2024-01-01', lookback=2) }}
    -- No is_incremental() block: dbt filters each batch by event_time,
    -- runs batches independently, and can retry/backfill one batch at a time
    SELECT * FROM {{ ref('stg_events') }}
    ```

=== "Snapshot (SCD2)"

    ```yaml
    # dbt 1.9+: snapshots are configured in YAML (legacy {% snapshot %} blocks still run)
    snapshots:
      - name: orders_snapshot
        relation: source('erp', 'orders')
        config:
          schema: snapshots
          unique_key: order_id
          strategy: timestamp
          updated_at: updated_at
          hard_deletes: invalidate
    ```

=== "Build only what changed (CI)"

    ```bash
    dbt build --select state:modified+ --defer --state ./prod-artifacts
    ```

!!! example "Worked scenario: incremental model silently drops rows"
    **Symptom:** Row counts in the incremental fact are lower than the source.

    **Reasoning:**
    1. **Watermark misses late data:** the filter uses `> MAX(updated_at)`, but an
       event arrived with an older timestamp → never picked up. → add a **lookback
       window** (`MAX - interval`).
    2. **Non-unique `unique_key`:** merge collapses rows that aren't truly unique. →
       pick a genuinely unique key (or a surrogate hash).
    3. **Schema drift:** a new source column silently dropped. → set
       `on_schema_change`.
    4. **Confirm** with a `--full-refresh` rebuild and a row-count test.

    **Outcome:** "Incremental correctness bugs are almost always watermark or key
    problems — I'd add a lookback and verify the key uniqueness."

??? question "When do you use incremental vs table vs view?"
    **View**: cheap, always fresh, no storage — light transforms/staging. **Table**:
    full rebuild each run — simple, good when small or logic changes often.
    **Incremental**: only new/changed rows — large fact tables where full rebuilds
    are too slow/costly. For large time-series facts, the **microbatch** strategy
    (dbt 1.9+) splits work into independent time batches with built-in lookback and
    per-batch retries and backfills. Incremental adds complexity (late data, backfills, schema
    drift), so only when full refresh actually hurts.

??? question "An incremental model is silently missing rows. What's wrong?"
    Usual causes: the `is_incremental()` filter misses **late-arriving** data (older
    `updated_at` than current max); a non-unique `unique_key` causing merge
    collisions; or source late-updates not captured by the timestamp. Fixes: a
    **lookback window**, a truly unique key, or periodic `--full-refresh`. For
    correctness-critical data prefer `merge` with a robust key.

??? question "How do you handle a schema change on an incremental model?"
    Incremental models don't auto-add columns by default. Use
    `on_schema_change='append_new_columns'` (or `sync_all_columns`), or
    `--full-refresh` to rebuild. Plan backfills so you don't reprocess everything.

---

## Testing & reliability

=== "Schema tests"

    ```yaml
    models:
      - name: fct_orders
        columns:
          - name: order_id
            data_tests: [unique, not_null]   # `tests:` still works; `data_tests:` since 1.8
          - name: customer_id
            data_tests:
              - relationships: {to: ref('dim_customers'), field: customer_id}
    ```

=== "Model contract"

    ```yaml
    models:
      - name: fct_orders
        config: {contract: {enforced: true}}
        columns:
          - {name: order_id, data_type: number}
          - {name: amount,   data_type: number}
    ```

??? question "How do you stop a bad upstream change from breaking BI?"
    Layered defense: **schema tests** (`unique`, `not_null`, `relationships`,
    `accepted_values`) on key columns; **model contracts** to enforce column
    names/types so breaking changes fail at build; **source freshness** checks; and
    run tests in **CI** on every PR (`state:modified+`) so breakage is caught before
    merge, not in the dashboard.

??? question "Singular vs generic tests, and when to write custom ones?"
    **Generic** tests are reusable/parameterized (built-ins + dbt-utils).
    **Singular** tests are one-off SQL returning zero rows on success (e.g. "no
    negative amounts"). Write a **custom generic** test when you repeat the same
    singular logic across models.

??? question "What are dbt unit tests and how do they differ from data tests?"
    **Data tests** (generic/singular) run against real warehouse data after a model
    builds and check its *output* (unique, not null, relationships). **Unit tests**
    (dbt 1.8+) check the model's *logic* against small mocked inputs defined in
    YAML (`given` rows for each `ref`/`source`, `expect` rows), before or without
    real data. Use them for tricky SQL: window functions, regex parsing, edge cases
    in CASE logic, incremental branches (you can override `is_incremental`). Run
    unit tests in CI only, since they validate code, not data.

??? question "How do you test freshness and completeness, not just validity?"
    **Source freshness** (`loaded_at_field` + `warn/error after`) catches stale
    upstreams. For completeness, add row-count/volume anomaly checks (dbt-utils or
    packages like `elementary`/`dbt_expectations`), and reconciliation tests
    comparing aggregates to a source of truth.

---

## Project structure & performance

??? question "How do you structure a dbt project that scales to hundreds of models?"
    Layered folders: **staging** (1:1 with sources, light cleanup, views),
    **intermediate** (business-logic building blocks), **marts** (facts/dims).
    Enforce naming (`stg_`, `int_`, `fct_`, `dim_`), one source of truth per
    concept, `ref()`/`source()` everywhere, group marts by domain, keep models
    single-responsibility.

??? question "dbt runs are getting slow. How do you speed them up?"
    Convert expensive full-refresh models to **incremental**; use `state:modified+`
    in CI to build only changed models + children; raise `threads`; push heavy logic
    to right-sized warehouses; avoid deep view-on-view chains (materialize hot
    intermediates as tables).

??? question "What does `ref()` buy you over hardcoding table names?"
    It builds the **DAG**: correct run order, `--select`/`state:` selection,
    per-environment schema swapping, and lineage/docs. Hardcoding breaks ordering,
    selection, and environment isolation.

??? question "How do you do zero-downtime deploys of dbt models to prod?"
    Build into a **new schema/clone**, run tests, then swap (or use blue/green
    schema promotion). With Snowflake, zero-copy clone + `SWAP` gives atomic cutover
    and instant rollback. Deploy prod only from the main branch after CI passes.

---

## Governance & collaboration

??? question "What are dbt Mesh, the Semantic Layer and the Fusion engine?"
    **dbt Mesh** splits a monolith into multiple projects owned by domains:
    cross-project `ref`, model **access** levels (private/protected/public),
    **groups**, **contracts** and **versions** make public models act like APIs.
    The **Semantic Layer** (MetricFlow) defines metrics once in YAML so BI tools and
    AI agents query consistent definitions instead of re-implementing SQL; dbt Labs
    open-sourced MetricFlow under Apache 2.0 in late 2025. **Fusion** is the new
    Rust-based dbt engine: much faster parsing, real SQL comprehension (catches
    column errors before hitting the warehouse) and state-aware orchestration; check
    its adapter coverage and status before committing a migration. dbt Labs has
    since merged with Fivetran; dbt Core remains open source.

??? question "How do dbt and Snowflake governance fit together?"
    dbt generates SQL/DDL but runs **as a role** in Snowflake — RBAC, masking, and
    row access policies still apply. Keep dbt's role least-privilege, separate
    dev/prod databases, use dbt to *document* (descriptions, `persist_docs`) while
    Snowflake *enforces* access. **Exposures** document downstream BI dependencies
    for impact analysis.

??? question "How do you manage dev vs prod safely?"
    **Targets/environments**: dev builds into a personal/dev schema, prod into prod,
    controlled by `profiles.yml` targets + CI. Use `generate_schema_name`
    conventions, run CI on PRs against a clone/dev, and prod-deploy only from main
    after tests pass.

---

## Rapid-fire

| Q | A |
|---|---|
| `ref` vs `source`? | ref = another dbt model; source = raw external table |
| Seed? | small CSV loaded as a table (lookups/mappings) |
| Snapshot? | SCD2 history tracking of a mutable source |
| `{{ this }}`? | current model's relation (incremental filters) |
| `--full-refresh`? | rebuild incremental models from scratch |
| Exposure? | documents a downstream consumer for lineage |
| dbt-utils? | community macro package (surrogate keys, tests, helpers) |
| Contract? | enforces column names/types at build time |
| Unit test? | mocked inputs → expected output; tests logic, not data |
| Microbatch? | incremental by independent time batches (`event_time`, `batch_size`) |
| `state:modified+`? | build changed models + their downstream |
| Source freshness? | warn/error when upstream data is stale |

---

## Pitfalls interviewers probe

- Incremental watermark missing late-arriving data (no lookback).
- Non-unique `unique_key` causing merge duplicates.
- Deep view-on-view chains killing query performance.
- No tests/contracts → silent breakage reaches BI.
- Hardcoding table names instead of `ref()`.
- Forgetting `on_schema_change` on incremental models.

---

## Self-quiz

1. Your incremental model drops rows — how do you diagnose and fix it?
2. When is a view the right materialization, and when is it wrong?
3. How do you stop an upstream change from breaking dashboards?
4. Structure a 300-model project — what layers and naming?
5. dbt runs are slow — what levers do you pull?
6. What exactly does `ref()` enable that a table name doesn't?
7. How do dbt and Snowflake RBAC interact?
8. How do you deploy models to prod with instant rollback?
9. When would you write a unit test instead of a data test?
10. When does microbatch beat a merge-based incremental model?

!!! note "Cross-links"
    Deep dive: [Technologies → dbt](../Technologies/dbt/index.md) ·
    Related: [Snowflake Interview Q&A](Snowflake_Interview_QA.md) ·
    [Databricks Interview Q&A](Databricks_Interview_QA.md)
