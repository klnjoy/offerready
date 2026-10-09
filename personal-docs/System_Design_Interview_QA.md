---
icon: material/sitemap
---

# System Design Interview Q&A — Senior & Staff, AI and Data

*Last reviewed: October 2026*

These questions cover system design rounds for senior and staff roles where AI and data platforms are central. Interviewers want a clear structure, honest trade-offs, numbers that drive decisions, and a strong sense of how the system fails and how you would know.

## Core concepts

??? question "What framework do you use to approach a system design interview?"
    **Short answer:** Clarify requirements, estimate scale, define the API and data model, sketch the high-level design, then go deep on bottlenecks, failure modes and trade-offs.

    **In depth:**
    - Functional requirements: who uses it, core flows, what is out of scope.
    - Non-functional: latency targets, availability, consistency, data residency, cost ceiling.
    - Estimates: requests per second at peak, storage growth, payload sizes, tokens per day for AI systems.
    - API and data model: the few endpoints and entities that matter, with access patterns.
    - Deep dives: pick the two hardest parts, such as retrieval latency or write amplification, and design them properly.
    - Close with observability, rollout and what you would build first.

    Staff signal comes from stating assumptions, revisiting them when numbers change the design, and naming what you would not build.

    **Follow-up they'll ask:** How much time on requirements? About five minutes; enough to change the design, not enough to stall.

??? question "How do you choose between strong and eventual consistency in a design?"
    **Short answer:** Ask what breaks for the user or the business if a read is stale, then use strong consistency only where that cost is real, such as balances, quotas, permissions and inventory.

    **In depth:** Strong consistency typically costs latency and availability, especially across regions, because writes need coordination. Eventual consistency scales and survives partitions better but needs design for stale reads, conflicts and ordering. Many systems mix both: authoritative writes go to a strongly consistent store, while search indexes, caches, feature stores and analytics are eventually consistent derived views. Read-your-writes for the acting user can often be provided cheaply by routing that user to the primary or using session tokens. Permission revocation is a common trap: a stale ACL in a search index can leak data, so check permissions at query time from the source of truth.

    **Follow-up they'll ask:** How do you resolve concurrent writes under eventual consistency? Version vectors or last-writer-wins with clear semantics, or CRDTs for mergeable data.

??? question "How do you design caching for a high-traffic service, and what are the main pitfalls?"
    **Short answer:** Cache where reads dominate and staleness is tolerable, choose cache-aside or write-through deliberately, and plan for invalidation, stampedes and hot keys.

    **In depth:** Cache-aside is simplest: read the cache, fall back to the database, then populate with a TTL. Invalidation on write is the hard part, so prefer short TTLs plus explicit deletes on change, or event-driven invalidation from change data capture. Stampedes happen when a hot key expires and thousands of requests hit the database; use request coalescing, early probabilistic refresh, or locks. Hot keys can overload one cache shard, so replicate them or add a local in-process tier. For AI systems, layers include embedding caches, retrieval result caches and response or semantic caches, each keyed with model and prompt version so upgrades do not serve stale outputs.

    **Follow-up they'll ask:** How do you measure whether a cache is worth it? Hit rate, latency saved, backend load reduced, and the incident cost of staleness.

??? question "How do queues and backpressure protect a system, and how do you design them?"
    **Short answer:** Queues decouple producers from consumers and absorb bursts; backpressure ensures that when consumers fall behind, the system slows intake or sheds load instead of collapsing.

    **In depth:** An unbounded queue just moves the failure: latency grows until messages are useless or memory runs out. Bound queues and decide the overflow policy: reject with 429, drop low-priority work, or degrade quality. Scale consumers on lag, not CPU. Use per-tenant or priority queues so one noisy tenant cannot starve others. Retries need exponential backoff with jitter and a dead-letter queue, otherwise poison messages loop forever. For LLM workloads, concurrency limits on provider calls are a form of backpressure, because provider rate limits are a hard ceiling.

    **Follow-up they'll ask:** Kafka or SQS-style queue? Kafka for ordered, replayable streams with many consumers; a task queue for independent jobs with per-message acknowledgement.

??? question "What is idempotency and how do you implement it across retries and at-least-once delivery?"
    **Short answer:** An idempotent operation produces the same result however many times it runs; you implement it with idempotency keys, deduplication records and naturally idempotent writes such as upserts.

    **In depth:** Clients send an idempotency key with mutating requests. The server stores the key with the result in the same transaction as the side effect, and returns the stored result on a retry. Keys need a TTL and must be scoped by tenant. For consumers, track processed message ids or design writes as upserts keyed on a business id. External side effects such as payments or emails are the risky part; use the provider's idempotency features or an outbox. Exactly-once is achievable only within bounded systems; end to end you design for at-least-once plus idempotency.

    **Follow-up they'll ask:** What if two requests with the same key arrive at once? Take a lock or insert the key first with a unique constraint so only one proceeds.

??? question "How do you design rate limiting for a large API platform?"
    **Short answer:** Use token buckets or sliding windows keyed by tenant, user and endpoint, enforced at the edge for coarse limits and in a shared store for precise, cost-aware limits.

    **In depth:** Token buckets allow bursts while capping sustained rate and are cheap to implement atomically in Redis. Sliding windows are fairer at boundaries. Across regions, either accept approximate global limits with local buckets that sync, or route a tenant to a home region. For AI APIs, limit tokens and concurrency as well as requests, and add spend caps. Return 429 with Retry-After, and expose remaining quota headers. Decide fail-open or fail-closed explicitly when the limiter store is down, and protect internal dependencies with their own limits so a retry storm cannot cascade.

    **Follow-up they'll ask:** How do you handle a premium tenant needing bursts? Larger bucket capacity or reserved concurrency, priced accordingly.

??? question "How do you scale reads differently from writes?"
    **Short answer:** Reads scale with replicas, caches, CDNs and denormalised views; writes scale with partitioning, batching, async processing and reducing write amplification.

    **In depth:** For reads, add replicas and accept replica lag, cache aggressively, and build read-optimised projections such as search indexes or materialised views. For writes, a single primary eventually becomes the limit, so shard by a key that spreads load evenly and keeps most queries within one shard; tenant id is common. Avoid hot partitions from monotonically increasing keys. Batch small writes, use append-only logs, and move non-critical work off the write path. CQRS separates write models from read models when access patterns diverge strongly, at the cost of eventual consistency and more moving parts.

    **Follow-up they'll ask:** How do you reshard without downtime? Dual-write or CDC into the new layout, backfill, verify, then cut reads and finally writes.

??? question "How do you build cost control into an AI-heavy system from day one?"
    **Short answer:** Measure cost per request, per tenant and per feature, then use budgets, routing, caching and limits to keep unit economics inside a target.

    **In depth:**
    - Attribute every model call with tenant, feature, model and token counts so cost is visible, not a monthly surprise.
    - Route easy requests to smaller, cheaper models and reserve frontier models for hard ones.
    - Cache embeddings, retrieval results and deterministic responses; use provider prompt caching for long shared prefixes.
    - Trim context: better retrieval beats stuffing more tokens.
    - Enforce per-tenant budgets and alerts, and cap max output tokens.
    - Use batch APIs for offline work, which are usually cheaper.

    Tie it to pricing so heavy users pay for heavy usage.

    **Follow-up they'll ask:** How do you know routing did not hurt quality? Run evals on each route and monitor quality signals per model.

## Scenarios

??? question "Design a RAG assistant for 50,000 employees over internal documents with access control."
    **Short answer:** Build an ingestion pipeline into a hybrid index with per-chunk ACL metadata, a query service that filters by the user's permissions, reranks and generates with citations, plus evals and tracing.

    **In depth:**
    - Ingestion: connectors with incremental sync, parsing, chunking, embeddings, and ACLs copied from source systems.
    - Index: vector plus keyword search, partitioned by tenant or department, with permission metadata.
    - Query path: authenticate, resolve group membership, rewrite the query, retrieve with permission filters, rerank, generate with citations.
    - Freshness: change events or frequent incremental sync, and fast deletion handling.
    - Quality: golden question sets, recall at k, faithfulness checks, user feedback.
    - Scale: estimate peak concurrent users and token budget; cache embeddings and frequent answers per permission scope.

    The hardest part is permissions staying correct as people change teams.

    **Follow-up they'll ask:** Why not filter permissions after retrieval? Post-filtering can return zero results and risks leaking via summaries; filter inside the search.

??? question "Design an LLM gateway that sits between internal teams and multiple model providers."
    **Short answer:** A gateway gives one API for all models and centralises auth, routing, quotas, fallbacks, logging, cost attribution, guardrails and caching.

    **In depth:** Teams call one OpenAI-compatible or internal API with their service identity. The gateway maps a logical model name to providers, applies per-team rate and spend limits, and handles retries and failover across providers or regions when one degrades. It records traces with token counts and cost, redacts or blocks sensitive data according to policy, and stores prompts only where retention policy allows. Keep it stateless and horizontally scaled, with streaming pass-through and minimal added latency. Risks: it becomes a single point of failure, so deploy multi-zone and keep the hot path simple; and abstraction can hide provider-specific features teams need.

    **Follow-up they'll ask:** How do you handle provider outages? Health-check providers, open circuit breakers, and fail over to an equivalent model validated by evals.

??? question "Design a feature store that serves both model training and low-latency online inference."
    **Short answer:** Use an offline store for historical features and point-in-time correct training sets, an online key-value store for low-latency serving, and one feature definition that feeds both.

    **In depth:** Feature definitions live in a registry with owners, freshness SLAs and lineage. Batch pipelines compute features into the offline store, typically a lakehouse table, and materialise the latest values into an online store such as Redis, DynamoDB or Bigtable. Streaming pipelines update real-time features directly. Training sets must use point-in-time joins so labels only see features known at that moment, avoiding leakage. Training-serving skew is the main failure mode, so compute features with the same logic and monitor distributions in both paths. Online reads should be single-digit milliseconds at p99 with batched lookups by entity key.

    **Follow-up they'll ask:** How do you detect skew? Log served features, compare them with offline recomputation, and alert on divergence.

??? question "Design a data platform that supports both real-time and batch analytics."
    **Short answer:** Land events once in a durable log, process streams for low-latency views, store everything in open lakehouse tables, and run batch on the same tables for correctness and backfills.

    **In depth:** Producers write to Kafka or a managed equivalent with schema registry and contracts. Stream processors such as Flink or Spark Structured Streaming produce real-time aggregates and write to lakehouse tables in Delta, Iceberg or Hudi. Batch jobs reprocess from the same storage for late data and corrections, which avoids maintaining two separate code paths as in classic lambda architecture. Organise layers as raw, cleaned and business-ready. Governance covers catalog, lineage, access control and data quality checks. Key trade-offs are latency versus cost, exactly-once guarantees, and handling late or out-of-order events with watermarks.

    **Follow-up they'll ask:** How do you backfill without breaking consumers? Write to a new version or partition, validate, then swap atomically.

??? question "Design a multi-tenant AI SaaS product where tenants upload documents and chat with them."
    **Short answer:** Choose an isolation model per layer, enforce tenant context everywhere from a single trusted source, and add per-tenant quotas, keys, data residency and cost tracking.

    **In depth:**
    - Isolation spectrum: shared tables with tenant id, schema or index per tenant, or dedicated stacks for enterprise tiers.
    - Tenant id comes from the auth token, never from the request body, and is enforced in queries, vector filters, caches and logs.
    - Noisy neighbours: per-tenant rate limits, queues and concurrency caps.
    - Security: per-tenant encryption keys for regulated customers, regional deployments for residency.
    - Cost: attribute tokens, storage and compute per tenant to protect margins.
    - Operations: tenant-aware observability and the ability to export or delete a tenant's data completely.

    **Follow-up they'll ask:** Shared vector index or per-tenant? Shared with mandatory filters scales cheaply; per-tenant gives stronger isolation and simpler deletion, at higher overhead.

??? question "Your system's latency doubles every day at 9 a.m. and recovers by 10 — walk through how you investigate."
    **Short answer:** Correlate the spike with load, scheduled jobs and dependencies using metrics and traces, find the saturated resource, then fix the cause rather than just adding capacity.

    **In depth:**
    - Compare request rate at 9 a.m. with capacity; maybe autoscaling reacts too slowly to a predictable ramp.
    - Check scheduled jobs, cache expiry and batch loads that coincide, such as overnight ETL finishing or a cron warming caches.
    - Use traces to see which span grows: database, cache misses, a provider, or queueing in your own service.
    - Look at saturation: connection pools, CPU throttling, disk IOPS, provider rate limits.

    Fixes might include scheduled pre-scaling, moving batch jobs, staggering TTLs, or adding pool capacity. Then add an alert on the leading indicator.

    **Follow-up they'll ask:** How do you prove the fix worked? Compare the same window over several days against the SLO.

??? question "How do you design for failure in a distributed AI system, and what failure modes do you plan for?"
    **Short answer:** Assume every dependency will be slow or down, so use timeouts, retries with budgets, circuit breakers, bulkheads, graceful degradation and tested runbooks.

    **In depth:** Common failure modes include provider outages or rate limiting, slow vector search, stale indexes, poison messages, retry storms, regional loss and bad deploys of prompts or models. Bulkheads isolate resources so one failing feature does not exhaust shared pools. Degrade gracefully: fall back to a smaller model, return search results without a generated answer, or serve cached responses. Make deploys reversible with canaries and feature flags. Practise with game days and chaos tests. Define SLOs and error budgets so trade-offs between velocity and reliability are explicit.

    **Follow-up they'll ask:** What is the most underrated failure mode? Retry storms; uncoordinated retries can turn a brief blip into a full outage.

??? question "What observability would you build into a new AI platform before launch?"
    **Short answer:** Traces across every hop including retrieval and model calls, RED and saturation metrics, quality and cost signals, structured logs, and SLO-based alerts.

    **In depth:** Use OpenTelemetry so traces cover the gateway, retrieval, reranking, model calls and tools, with token counts and model versions as attributes. Platform metrics include latency percentiles, error rates, queue lag and pool saturation. AI-specific signals include time to first token, cost per request, retrieval hit rates, guardrail triggers, and online quality proxies such as thumbs down rate and escalations. Sample and store prompts and outputs only under a clear retention and redaction policy. Dashboards per tenant and feature help support. Alerts should be on SLO burn rate, not every spike.

    **Follow-up they'll ask:** How do you debug a single bad answer? Pull the trace by request id to see the retrieved chunks, prompt version and model output.
