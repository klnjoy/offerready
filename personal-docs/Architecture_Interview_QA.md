---
icon: material/sitemap
---

# Architecture Interview Q&A — Staff & Principal Scenario-Based

*Last reviewed: October 2026*

Staff and principal architect questions: build versus buy, team topology, large migrations, multi-region and disaster recovery, FinOps, governance, platform selection, event-driven design, API strategy, enterprise GenAI, decision records and setting technical direction. Interviewers look for principles, explicit trade-offs and how you would measure whether a decision was right.

## Core concepts

??? question "How do you decide between building and buying a capability?"
    **Short answer:** Build what differentiates you and buy what is commodity, then test that instinct against total cost of ownership, time to value, lock-in and your team's ability to operate it.

    **In depth:**

    - Ask whether the capability is a source of competitive advantage; if not, lean toward buying.
    - Compare total cost over three to five years: licences versus engineers, operations, upgrades and on-call.
    - Weigh time to value and opportunity cost of your engineers.
    - Assess lock-in: data portability, open formats, exit costs and vendor viability.
    - Check fit: how much customisation is needed; heavy customisation of a bought product often gives the worst of both.
    - Run a time-boxed evaluation with real use cases before committing.

    **Follow-up they'll ask:** What about open source? It is a third option with no licence but real operational cost; budget for the people to run it.

??? question "How do you structure platform teams versus product teams?"
    **Short answer:** Product or stream-aligned teams own customer outcomes end to end; platform teams provide self-service capabilities that reduce their cognitive load, and are run like internal products.

    **In depth:** Team Topologies gives useful language: stream-aligned teams, platform teams, enabling teams and complicated-subsystem teams. A platform is justified when several teams repeatedly solve the same problem, such as deployment, data pipelines or observability. The platform must be self-service with clear interfaces, documentation and an SLA, or it becomes a ticket queue and bottleneck. Measure success by adoption, time to onboard and reduction in duplicated effort. The failure modes are a platform built without users in mind, or mandatory adoption of a weak product.

    **Follow-up they'll ask:** When should a platform team not exist? When there are too few consuming teams to justify it; a shared library or guild may be enough.

??? question "How do you define RPO and RTO and design disaster recovery to meet them?"
    **Short answer:** RPO is how much data you can afford to lose, RTO is how long you can be down; set them per system based on business impact, then choose the cheapest DR pattern that meets them.

    **In depth:**

    - Classify systems into tiers with the business, since not everything needs minutes of RTO.
    - Patterns from cheapest to most expensive: backup and restore, pilot light, warm standby, active-active multi-region.
    - RPO drives replication: asynchronous replication means some data loss; synchronous replication across regions adds latency.
    - Include dependencies; your service is only as recoverable as its database, identity provider and DNS.
    - Test with regular failover drills and measure the real RTO and RPO achieved.

    **Follow-up they'll ask:** Why not make everything active-active? It multiplies cost and complexity, especially data consistency, and most systems do not need it.

??? question "How do you build cost into architecture decisions?"
    **Short answer:** Treat cost as a first-class non-functional requirement, make it visible per team and per unit of business value, and design for elasticity and efficient defaults.

    **In depth:** FinOps practice starts with allocation: consistent tagging so every cost maps to an owner. Then define unit economics, such as cost per transaction, per customer or per thousand LLM requests, so growth and efficiency can be separated. Architecture levers include right-sizing, autoscaling, storage tiering and lifecycle policies, spot capacity for interruptible work, commitments for steady baselines, and reducing data egress. Design reviews should include a cost estimate. Watch for cost traps like cross-region traffic, chatty services and unbounded logs.

    **Follow-up they'll ask:** Who owns cloud cost? The teams that create it, with a central FinOps function providing data, tooling and commitment management.

??? question "What does good data governance and lineage look like in a modern data platform?"
    **Short answer:** Clear ownership, a catalogue with business definitions, access control based on classification, and automated lineage from source to report, built into the platform rather than added as paperwork.

    **In depth:**

    - Every dataset has an owner, a classification such as public, internal, confidential or personal data, and a quality expectation.
    - A central catalogue, such as Unity Catalog, Purview, Dataplex or an open-source option, holds metadata and policies.
    - Access is role or attribute based, with row and column-level controls and masking for sensitive data.
    - Lineage is captured automatically from query engines and pipelines, so impact analysis and audits are fast.
    - Data contracts between producers and consumers prevent silent breaking changes.

    **Follow-up they'll ask:** How do you get adoption? Make the governed path the easiest path, with self-service access requests.

??? question "How do you choose between Snowflake, Databricks and BigQuery style platforms?"
    **Short answer:** Start from workloads, skills and constraints rather than features: the mix of SQL analytics versus engineering and ML, open format needs, cloud alignment, governance and cost model.

    **In depth:**

    - Workload mix: SQL-heavy BI and analytics, large-scale Spark engineering, streaming and ML all favour different strengths, though the platforms have converged a lot.
    - Openness: whether you need data in open table formats like Iceberg or Delta readable by multiple engines.
    - Cloud alignment and existing contracts.
    - Operations: how much tuning and cluster management your team wants.
    - Cost model: understand compute pricing, concurrency behaviour and idle costs with a proof of concept on your own queries.
    - Governance, security integration and data sharing needs.

    **Follow-up they'll ask:** Can you avoid lock-in? Partly, by keeping data in open formats and transformations in portable tools like dbt, but compute features and governance will still bind you somewhat.

??? question "When do you choose event-driven architecture over batch processing?"
    **Short answer:** Choose event-driven when the business needs low-latency reactions or decoupled services; choose batch when latency of hours is acceptable, since it is simpler, cheaper and easier to reprocess.

    **In depth:** Event-driven designs with Kafka or similar fit fraud detection, inventory updates, notifications and integrating many services without tight coupling. They add complexity: schema evolution, ordering, idempotency, exactly-once semantics trade-offs, replay and harder debugging. Batch suits reporting, model training and reconciliation where correctness and simplicity matter more. Many architectures mix both: events for operational flows and landing raw events into the lakehouse, batch for heavy analytics. Ask what the business loses with a one-hour delay; if nothing, do not build streaming.

    **Follow-up they'll ask:** How do you handle schema changes in events? Use a schema registry with compatibility rules and version events rather than breaking them.

??? question "What should an enterprise API strategy cover?"
    **Short answer:** Consistent design standards, a clear ownership and lifecycle model, security and gateway policies, discoverability, and a versioning and deprecation process that consumers can rely on.

    **In depth:**

    - Standards: resource naming, error formats, pagination, idempotency keys and API-first design with OpenAPI or similar.
    - Style choice by use case: REST for broad interoperability, gRPC for internal high-performance calls, events for asynchronous integration, GraphQL where client-driven aggregation helps.
    - Gateway for authentication, rate limiting, observability and policy enforcement.
    - Developer portal and catalogue so teams find and reuse APIs.
    - Versioning with backward compatibility by default and published deprecation timelines.
    - Increasingly, exposing well-described APIs for AI agents, for example via MCP servers, with the same security controls.

    **Follow-up they'll ask:** How do you enforce standards? Linting in CI and design reviews for new public APIs, not a committee for every change.

??? question "What is a reference architecture for GenAI in the enterprise?"
    **Short answer:** A governed gateway to models, a retrieval layer over permissioned enterprise data, orchestration for prompts and agents, and evaluation, observability and guardrails across all of it.

    **In depth:**

    - Model gateway: routes to several providers and self-hosted models, handles auth, quotas, cost tracking, logging and fallback.
    - Data and retrieval: ingestion, chunking and embedding pipelines, vector or hybrid search, with document-level permissions enforced at query time.
    - Orchestration: prompt templates, tool calling and agent workflows with limits on actions.
    - Guardrails: input and output filtering, PII redaction, prompt injection defences and human approval for high-risk actions.
    - Evaluation and observability: offline eval sets, online quality monitoring, tracing and cost per use case.
    - Governance: model inventory, risk classification and audit trail.

    **Follow-up they'll ask:** Central platform or each team builds its own? Central for the gateway, guardrails and eval tooling; teams own their use cases on top.

??? question "How do you use architecture decision records effectively?"
    **Short answer:** Write short, versioned records of significant decisions with context, options, the decision and consequences, stored next to the code, so future teams understand why.

    **In depth:** An ADR should be one or two pages: the problem and constraints, options considered with trade-offs, the decision, and expected consequences including what you are giving up. Keep them in the repository or a central docs site, numbered and immutable; supersede rather than edit. Use them for decisions that are expensive to reverse, such as data store choice or service boundaries, not every library pick. The review process matters: share drafts with affected teams for comment. ADRs prevent relitigating decisions and speed up onboarding.

    **Follow-up they'll ask:** How do you know an ADR was right? Record the expected consequences and revisit them after six to twelve months.

??? question "How do you evaluate a new technology before adopting it?"
    **Short answer:** Start from a real problem, define evaluation criteria in advance, run a time-boxed proof of concept on representative workloads, and consider operational maturity, not just features.

    **In depth:**

    - Problem first: what current limitation does it solve and what is it worth?
    - Criteria: performance on your data, security and compliance, integration effort, operability, community or vendor health, licence and cost.
    - Proof of concept with production-like data and failure testing, not a vendor demo.
    - Assess the people cost: skills, hiring and on-call.
    - Use a technology radar with stages such as assess, trial, adopt and hold to communicate status across the organisation.

    **Follow-up they'll ask:** How do you stop teams adopting tools ad hoc? Make the radar and a lightweight review the easy path, with clear criteria rather than blanket bans.

## Scenarios

??? question "You are leading an on-prem to cloud migration of several hundred applications. How do you approach it?"
    **Short answer:** Inventory and classify every application, pick a migration strategy per app, build a secure landing zone first, then migrate in waves with measured outcomes.

    **In depth:**

    - Discovery: dependencies, data volumes, licensing, compliance and business criticality for each application.
    - Classify by the common Rs: retire, retain, rehost, replatform, refactor or replace with SaaS. Retiring a share of apps is often the cheapest win.
    - Landing zone: account structure, networking, identity, security guardrails and cost tagging defined as code.
    - Waves: start with low-risk apps to prove the process, then group by dependency.
    - Plan data migration and cutover windows carefully; data gravity often dictates sequencing.
    - Measure: apps migrated, run cost compared with the business case, incidents and data centre exit date.

    **Follow-up they'll ask:** What is the biggest risk? Lifting and shifting everything and ending up with higher costs and no modernisation benefit.

??? question "How would you migrate a legacy data warehouse to a lakehouse without disrupting the business?"
    **Short answer:** Run old and new in parallel, migrate by domain or consumer group, validate outputs automatically, and decommission the old warehouse only when consumers have moved.

    **In depth:** Start by cataloguing workloads, reports and their consumers, and identify unused tables to drop. Set up the target with open table formats, governance and the transformation framework. Migrate one domain end to end, including ingestion, transformations and reports, as a pilot. Use automated reconciliation comparing row counts, aggregates and key metrics between old and new. Run dual pipelines for a defined period and switch consumers in groups. Track cost and query performance. Plan a firm decommission date backed by leadership, or the organisation pays for both indefinitely.

    **Follow-up they'll ask:** Big bang or incremental? Incremental almost always; big bang concentrates risk on one weekend.

??? question "A single shared database outage recently took down most of your products. How do you reduce blast radius?"
    **Short answer:** Remove shared single points of failure by isolating critical paths, partitioning data and services into cells or domains, and adding graceful degradation.

    **In depth:**

    - Separate the database by domain or service ownership so one workload cannot exhaust shared capacity.
    - Consider cell-based architecture, where customers are split across independent stacks so a failure affects a fraction.
    - Add bulkheads, timeouts, circuit breakers and connection limits so dependent services fail fast and degrade gracefully.
    - Cache or queue writes for non-critical paths.
    - Use progressive delivery and feature flags so a bad change affects few users first.
    - Measure with chaos experiments and track the percentage of customers affected per incident.

    **Follow-up they'll ask:** What does this cost? More infrastructure and operational complexity, so prioritise the most critical customer journeys.

??? question "You join as principal architect and teams are making inconsistent technical choices. How do you set direction?"
    **Short answer:** Listen first, then publish a small set of principles and paved paths agreed with team leads, and use lightweight governance such as ADRs and reviews rather than central control.

    **In depth:** Spend the first weeks understanding the current landscape, pain points and why teams chose what they did; inconsistency often has good local reasons. Identify the few areas where consistency truly matters, such as identity, data platform, observability and API standards, and leave the rest to teams. Write a technical strategy with principles, target architecture and a migration path, co-authored with senior engineers. Back it with paved paths that make the right choice easiest. Run an architecture forum for significant decisions. Measure progress by adoption and fewer integration incidents.

    **Follow-up they'll ask:** What if a strong team ignores the direction? Understand their objection; either it reveals a gap in the strategy or it needs a decision from engineering leadership.
