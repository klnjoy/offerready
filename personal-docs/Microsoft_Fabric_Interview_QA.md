---
icon: material/microsoft
---

# Microsoft Fabric Interview Q&A — Advanced & Scenario-Based

*Last reviewed: November 2026*

Fabric questions: OneLake, lakehouse vs warehouse, Direct Lake, capacities,
Real-Time Intelligence, governance, and CI/CD. Study at a glance, then open
each question for depth.

---

## Study checklist

Can you explain each without notes?

- [ ] Fabric = one SaaS analytics platform on one lake (OneLake)
- [ ] Lakehouse vs Warehouse: who authors the data decides
- [ ] Direct Lake vs Import vs DirectQuery: where data lives at query time
- [ ] OneLake shortcuts: pointers, not copies
- [ ] F SKUs and Capacity Units: one shared pool, pause/resume
- [ ] Pipelines vs Dataflows Gen2 vs notebooks
- [ ] Eventstream → Eventhouse → dashboard + Activator
- [ ] Fabric vs Databricks vs Synapse: center of gravity decides
- [ ] Semantic models and Direct Lake
- [ ] Governance: workspace roles + Purview labels + domains
- [ ] Git integration and deployment pipelines

---

## What Fabric is

??? question "What is Microsoft Fabric, and what is OneLake?"
    Fabric is Microsoft's **SaaS analytics platform**: Data Factory, Data
    Engineering (Spark), Data Warehouse, Real-Time Intelligence, and Power BI in
    one product, on one storage layer. **OneLake** is that layer — one logical
    data lake per tenant, built on ADLS Gen2, where every item stores data as
    **Delta/Parquet**. One copy serves every engine instead of copying
    lake → warehouse → Power BI model. Work is organized
    tenant → capacity → workspace → item. The value is one copy plus one
    governance plane, not new engines.

??? question "Lakehouse vs Warehouse in Fabric — how do you choose?"
    Both store Delta tables in OneLake and both are queryable by SQL. A
    **lakehouse** holds files + tables, is authored in Spark/Python (schema on
    read), and exposes a **read-only SQL analytics endpoint** — pick it when
    engineers or ML author the data. A **warehouse** holds tables only, with full
    T-SQL including INSERT/UPDATE/DELETE and multi-table transactions (schema on
    write) — pick it when a SQL team authors the data (star schemas, governed BI
    serving). Common shape: land and refine in a lakehouse, serve curated marts
    from a warehouse; either engine can read the other's tables.

---

## Storage & serving

??? question "Direct Lake vs Import vs DirectQuery — how do you choose?"
    **Direct Lake** (the Fabric default) reads Delta tables directly from
    OneLake into VertiPaq memory — Import-class speed with near-real-time
    freshness, because a refresh only updates metadata (**framing**), not a data
    copy. It falls back to DirectQuery for unsupported constructs. **Import**
    copies data into the model — fastest, but only as fresh as the last refresh;
    use it for non-Fabric sources or maximum performance. **DirectQuery** queries
    the source live — freshest, but performance depends on the source; use it when
    data must stay at source or is too large to copy. Default to Direct Lake for
    Fabric-native data.

??? question "What are OneLake shortcuts, and when do you use them instead of copying data?"
    A **shortcut** is a pointer that makes data in another location appear as a
    folder or table in your lakehouse — **no copy, no pipeline, no staleness**.
    Targets include other Fabric items (lakehouses, warehouses, KQL databases),
    ADLS Gen2, Blob, Amazon S3, Google Cloud Storage, Dataverse, and
    OneDrive/SharePoint. In **Tables**, a shortcut to Delta data is
    auto-registered as a table queryable from Spark and SQL; in **Files** it's
    raw data for Spark. Use shortcuts when another team already curates the data,
    or when data must stay in its home system (for example, Databricks-written
    Delta in ADLS). A shortcut is not a backup, and it inherits the source's
    availability and permissions.

??? question "How does Power BI fit into Fabric — what is a semantic model in Fabric?"
    Power BI is a first-class Fabric workload, not an add-on: reports run on
    **semantic models** that live in workspaces on the same capacity. A model
    defines tables, relationships, measures (DAX), and security (RLS/OLS) over
    Fabric data. In Fabric, **Direct Lake is the default storage mode**, so the
    model reads Delta tables from OneLake directly and stays fresh without a
    scheduled refresh. The same model serves reports, Excel, and Copilot/AI
    queries. Design point: model once and reuse everywhere — keep it thin (star
    schema, conformed dimensions) so every report shares the same definitions.

---

## Capacity & cost

??? question "How does Fabric capacity pricing work, and how do you control cost?"
    One shared pool per capacity: you buy an **F SKU** (F2 up to F2048) measured
    in **Capacity Units (CUs)**, and every workload — notebooks, pipelines,
    warehouse queries, reports — draws from the same pool. Pay-as-you-go bills
    per second (1-minute minimum); **1-year reservations cost less** for steady
    load; you can **pause a PAYG capacity** when idle and scale it up or down.
    There is **no autoscale** on F SKUs — resizing is manual. Below **F64**,
    report viewers need a Power BI Pro licence. Cost control: right-size the SKU,
    pause off-hours, use the Fabric Capacity Metrics app to see which workspace
    burns CUs, and use overage/surge protection. OneLake storage and networking
    bill separately.

---

## Building pipelines

??? question "Data Factory in Fabric: pipelines vs Dataflows Gen2 vs notebooks — when do you use each?"
    **Pipelines orchestrate**: copy data, call notebooks, Spark jobs, and
    dataflows, with control flow and triggers — the scheduler of the platform.
    **Dataflows Gen2** are low-code **Power Query** transformations for analysts:
    ingest and shape data without writing code, landing in a lakehouse or
    warehouse. **Notebooks** (Spark/Python) are for code-heavy transformation, ML,
    and anything Power Query can't express. Rule of thumb: analyst-owned shaping
    → Dataflow Gen2; scheduled multi-step movement with dependencies → a pipeline
    calling the dataflow or notebook; custom logic or ML → a notebook inside a
    pipeline.

??? question "How do you design a real-time flow in Fabric — Eventstream, Eventhouse, Activator?"
    **Eventstream** ingests and routes streaming data (Event Hubs, Kafka, custom
    apps) with optional transformation, to destinations. **Eventhouse** is the
    **KQL database** that stores it — fast queries over time-series and logs,
    with materialized views and stored functions. **Real-Time dashboards**
    visualize it live, and **Activator** watches for conditions and fires actions
    (alert, run a pipeline, post a Teams message) when a threshold is crossed.
    Pattern: Eventstream → Eventhouse → dashboard + Activator rule. Keep
    Eventstream destinations in the same workspace — cross-workspace deployment
    is limited.

---

## Choosing & governing

??? question "Fabric vs Databricks — how do you frame the choice?"
    Both are Delta-based lakehouses, so they interoperate: Databricks can write
    Delta to ADLS and Fabric can **shortcut** to it. **Databricks** leads for
    heavy Spark engineering and ML (Unity Catalog, MLflow, multi-cloud, deepest
    Spark control). **Fabric** leads where Power BI is central and the team wants
    one SaaS platform — engineering, warehousing, real-time, and BI under one
    capacity and one governance plane, with less to assemble. Choose on workload
    center of gravity and existing skills — and note Fabric is younger, so check
    a specific capability (for example, fine-grained RBAC or Git support for a
    given item) rather than assuming parity.

??? question "Fabric vs Synapse — what's the migration story?"
    Synapse is the previous generation — still supported, but Microsoft's
    investment has moved to Fabric; new greenfield work should start on Fabric.
    Migration maps concepts, not buttons: Synapse dedicated SQL pools →
    Fabric Warehouse, Spark pools → Fabric Spark, pipelines → Fabric Data
    Factory, Power BI → Fabric semantic models. The data layer helps — both use
    Delta/Parquet in a lake, so you can shortcut or copy rather than re-ingest
    everything. Move one domain at a time, keep Synapse running until the Fabric
    equivalents are proven, and re-check any Synapse-specific pattern for its
    Fabric equivalent.

??? question "How do you govern a Fabric workspace — roles, Purview, domains?"
    In layers. **Workspace roles** (Admin, Member, Contributor, Viewer) are
    coarse — combine them with item-level sharing and **OneLake data access
    roles** for folder-level least privilege. **Microsoft Purview** provides the
    catalog, lineage, and **sensitivity labels**: a label on a table flows through
    to reports built on it. Use **domains** to organize items by business area,
    and **endorsement** (promote/certify) to mark trusted items. Warehouses and
    semantic models add row- and object-level security. Interview point:
    governance in Fabric is "label once, inherit everywhere" — but workspace roles
    alone are not fine-grained security, so name the extra layer.

??? question "How do you do CI/CD in Fabric — Git integration and deployment pipelines?"
    **Git integration** syncs a workspace to a Git repo (Azure DevOps or GitHub)
    — changes are committed, branched, and merged like code — for supported items
    (notebooks, pipelines, semantic models, lakehouses, warehouses, Eventstreams,
    Eventhouses, KQL items, dashboards, Activator). **Deployment pipelines**
    promote content across **dev → test → prod** stages, with deployment rules to
    rebind connections per stage. Practice: develop in dev, commit to Git,
    promote via pipeline — and keep Eventstream destinations in the same
    workspace, since cross-workspace deployment is limited. Git support varies by
    item type, so check the item before promising full CI/CD.

!!! note "Cross-links"
    Related: [Databricks Interview Q&A](Databricks_Interview_QA.md) ·
    [Snowflake Interview Q&A](Snowflake_Interview_QA.md) ·
    [Data Engineering Interview Q&A](DataEngineering_Interview_QA.md)
