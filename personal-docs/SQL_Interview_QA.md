---
icon: material/database-search
---

# SQL Interview Q&A — Advanced & Scenario-Based

Senior SQL for data/analytics engineering: window functions, query tuning, data
modeling, and the tricky semantics interviewers probe. Study at a glance, then
open each question for depth.

!!! tip "How to use this page"
    Skim the **60-second talking points** and **rapid-fire** for recall, then
    drill into the collapsible questions. Finish with the **self-quiz**.
    Related: [Snowflake Interview Q&A](Snowflake_Interview_QA.md) ·
    [dbt Interview Q&A](dbt_Interview_QA.md).

---

## Study checklist

Can you explain each without notes?

- [ ] JOIN types and what each returns (incl. anti-joins)
- [ ] Window functions vs GROUP BY
- [ ] `RANK` vs `DENSE_RANK` vs `ROW_NUMBER`
- [ ] CTEs, recursive CTEs, and readability vs performance
- [ ] How an index (or micro-partition pruning) speeds a query
- [ ] `WHERE` vs `HAVING`, `UNION` vs `UNION ALL`
- [ ] NULL semantics (three-valued logic) and the traps
- [ ] Deduplication patterns
- [ ] Reading an execution plan
- [ ] SCD Type 2 and gaps-and-islands

---

## 60-second talking points

- **"Window functions compute across rows without collapsing them."** That's the
  difference from GROUP BY — you keep row detail plus an aggregate/rank.
- **"NULL is 'unknown,' not zero or empty."** It breaks equality, aggregates skip
  it, and `NOT IN` with a NULL bites you.
- **"Read the plan, don't guess."** Full scan, bad join order, or no pruning shows
  up there.

---

## Core concepts — simple, then the nuance

??? note "Window functions: explain it simply, then go deep"
    **Simple:** A window function does a calculation across a set of rows *related*
    to the current row, but unlike GROUP BY it doesn't merge them — every row stays.

    **The nuance:** `OVER (PARTITION BY ... ORDER BY ...)` defines the window.
    `ROW_NUMBER/RANK/DENSE_RANK` rank; `LAG/LEAD` look across rows; running totals
    use `SUM() OVER (ORDER BY ...)`. Frames (`ROWS BETWEEN ...`) control the window
    extent. They're the tool for "top-N per group," running totals, period-over-
    period, and dedup — all without a self-join.

??? note "NULL semantics: simple, then deep"
    **Simple:** NULL means "unknown." Comparing anything to NULL isn't true or
    false — it's unknown, so those rows quietly drop out of filters.

    **The nuance:** `x = NULL` is never true (use `IS NULL`). `NOT IN (subquery
    with a NULL)` returns no rows — a classic bug. Aggregates like `SUM`/`AVG`
    **skip** NULLs but `COUNT(*)` counts them; `COUNT(col)` doesn't. Use
    `COALESCE`/`NULLIF` deliberately, and prefer `NOT EXISTS` over `NOT IN` when
    NULLs are possible.

---

## Query patterns

=== "Top-N per group"

    ```sql
    SELECT * FROM (
      SELECT e.*,
             ROW_NUMBER() OVER (PARTITION BY department
                                ORDER BY salary DESC) AS rn
      FROM employees e
    ) WHERE rn <= 3;   -- top 3 earners per department
    ```

=== "Deduplicate, keep latest"

    ```sql
    SELECT * FROM (
      SELECT t.*,
             ROW_NUMBER() OVER (PARTITION BY natural_key
                                ORDER BY updated_at DESC) AS rn
      FROM t
    ) WHERE rn = 1;
    ```

=== "Running total & period-over-period"

    ```sql
    SELECT month, revenue,
           SUM(revenue) OVER (ORDER BY month) AS running_total,
           revenue - LAG(revenue) OVER (ORDER BY month) AS mom_change
    FROM monthly_revenue;
    ```

=== "Anti-join (rows with no match)"

    ```sql
    SELECT c.*
    FROM customers c
    LEFT JOIN orders o ON o.customer_id = c.id
    WHERE o.customer_id IS NULL;   -- customers with no orders
    ```

!!! example "Worked scenario: 'find the 2nd highest salary per department'"
    **Reasoning:**
    1. Per-group ranking → **window function**, partition by department.
    2. **`DENSE_RANK`** so ties don't skip the 2nd position (two people tied for #1
       still leaves a #2). `ROW_NUMBER` would arbitrarily pick one.
    3. Filter `rnk = 2`.

    ```sql
    SELECT department, employee, salary FROM (
      SELECT department, employee, salary,
             DENSE_RANK() OVER (PARTITION BY department
                                ORDER BY salary DESC) AS rnk
      FROM employees
    ) WHERE rnk = 2;
    ```

    **Talking point:** "The choice between ROW_NUMBER / RANK / DENSE_RANK *is* the
    interview — I'd ask how ties should behave."

??? question "RANK vs DENSE_RANK vs ROW_NUMBER?"
    All rank within a partition. **ROW_NUMBER** = unique 1,2,3 (ties broken
    arbitrarily). **RANK** = ties share a rank, then it **skips** (1,1,3).
    **DENSE_RANK** = ties share a rank, **no gap** (1,1,2). Pick by whether ties
    should share and whether you want gaps.

??? question "When do you use a window function instead of GROUP BY?"
    When you need the aggregate **alongside the row detail** (running totals,
    ranks, per-row share of group total, period-over-period), or top-N per group.
    GROUP BY collapses rows to one per group; a window keeps every row and adds the
    computed column. If you only need the summary, GROUP BY is simpler/cheaper.

??? question "How do you deduplicate rows keeping the most recent?"
    `ROW_NUMBER() OVER (PARTITION BY natural_key ORDER BY updated_at DESC)` then keep
    `rn = 1` (or `QUALIFY rn = 1` in Snowflake). This picks one row per key
    deterministically — better than `DISTINCT` (which can't choose *which* duplicate)
    or `GROUP BY` with `MAX` on every column.

??? question "Explain the NOT IN + NULL trap."
    If the subquery in `NOT IN (...)` returns even one NULL, the whole predicate
    evaluates to unknown for every row, so you get **zero rows** — silently wrong.
    Use `NOT EXISTS` (correlated) instead, which handles NULLs correctly, or filter
    NULLs out of the subquery.

---

## Performance & tuning

??? question "A query is slow. How do you approach it?"
    Read the **execution plan** first. Look for: **full table scans** where an index
    or partition filter should apply; **bad join order / method** (nested loop on
    big tables that should hash join); **exploding joins** (output rows >> inputs,
    grain bug); **sorts/spills**; and functions on filtered columns that prevent
    index/pruning use (`WHERE UPPER(col) = ...`). Fix the biggest node, remeasure.

??? question "Why can a function on a column kill index usage?"
    An index is on the raw column values. `WHERE UPPER(name) = 'X'` or
    `WHERE date(ts) = '...'` forces a computation per row, so the engine can't use
    the index/pruning on `name`/`ts` — it scans everything. Fix: store/compare in the
    indexed form, use a functional index, or rewrite as a range (`ts >= d AND ts <
    d+1`).

??? question "EXISTS vs IN vs JOIN — performance and correctness?"
    Often the optimizer treats them similarly, but: **EXISTS** short-circuits on the
    first match and handles NULLs safely (best for "does a related row exist").
    **IN** is fine for small, NULL-free lists. **JOIN** is right when you need columns
    from both sides — but watch for row multiplication if the join isn't unique. For
    "has any match," prefer `EXISTS`.

??? question "What makes a good index (or clustering) choice?"
    Index/cluster on columns used in **selective filters and join keys**, high
    cardinality, and frequent access paths. Composite index order matters
    (leftmost-prefix). Avoid indexing low-cardinality columns or over-indexing
    write-heavy tables (write cost). In Snowflake it's clustering/natural load order
    driving micro-partition pruning rather than b-tree indexes.

---

## Data modeling

??? question "Star schema vs normalized (3NF) — when each?"
    **3NF/normalized** for OLTP: minimizes redundancy, fast writes, integrity.
    **Star schema** (fact + dimension tables) for analytics/OLAP: denormalized for
    fast, simple aggregation queries and BI usability. Warehouses favor star/wide
    tables because storage is cheap and scan/join patterns are predictable.

??? question "How do you model slowly changing dimensions (SCD Type 2)?"
    Keep history by adding a new row per change with `valid_from`/`valid_to` (and an
    `is_current` flag), rather than overwriting (Type 1). Each business key can have
    multiple versioned rows; joins to facts use the version valid at the event time.
    Tools like dbt snapshots automate this.

??? question "Solve gaps-and-islands (consecutive runs)."
    Classic pattern: assign a group id via the difference between `ROW_NUMBER()` and
    the sequence value, then aggregate per group. Example — find consecutive active
    days:

    ```sql
    SELECT user_id, MIN(day) AS start_day, MAX(day) AS end_day, COUNT(*) AS len
    FROM (
      SELECT user_id, day,
             DATEADD('day',
               -ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY day), day) AS grp
      FROM activity
    )
    GROUP BY user_id, grp;
    ```

---

## Rapid-fire

| Q | A |
|---|---|
| `WHERE` vs `HAVING`? | WHERE filters rows before grouping; HAVING filters groups after |
| `UNION` vs `UNION ALL`? | UNION dedups (sorts); UNION ALL keeps dups (faster) |
| `ROW_NUMBER` vs `RANK` vs `DENSE_RANK`? | unique / ties+gap / ties+no-gap |
| Anti-join? | LEFT JOIN + `IS NULL` (or `NOT EXISTS`) |
| `NOT IN` + NULL? | returns zero rows — use `NOT EXISTS` |
| `COUNT(*)` vs `COUNT(col)`? | counts all rows vs non-NULL values |
| CTE vs subquery? | CTE = named, readable, reusable in the query |
| SCD2? | versioned dimension rows with valid_from/valid_to |
| Star schema? | fact + denormalized dimensions for analytics |
| Dedup keep-latest? | ROW_NUMBER over key ORDER BY ts DESC, keep rn=1 |

---

## Pitfalls interviewers probe

- Using `= NULL` instead of `IS NULL`.
- `NOT IN` with a nullable subquery.
- Functions on filter columns defeating indexes/pruning.
- Confusing WHERE vs HAVING.
- `UNION` when `UNION ALL` is meant (silent dedup + sort cost).
- Assuming JOIN won't multiply rows (non-unique key).

---

## Self-quiz

1. Find the 2nd-highest salary per department — which ranking function and why?
2. Explain the `NOT IN` + NULL trap and the fix.
3. When is a window function better than GROUP BY?
4. Why does `WHERE UPPER(col)=...` prevent index use?
5. EXISTS vs IN vs JOIN — pick one per scenario.
6. Model an SCD Type 2 dimension.
7. Deduplicate keeping the latest row per key.
8. Solve consecutive-runs (gaps-and-islands).

!!! note "Cross-links"
    Related: [Snowflake Interview Q&A](Snowflake_Interview_QA.md) ·
    [dbt Interview Q&A](dbt_Interview_QA.md) ·
    [Data Engineering Interview Q&A](DataEngineering_Interview_QA.md)
