---
icon: material/vector-triangle
---

# Vector Databases

*Last reviewed: October 2026*

!!! info "What's changed recently"
    - **Filtered search got much better.** pgvector 0.8 added iterative index
      scans so filtered HNSW queries keep returning enough rows, and most engines
      now integrate filters into ANN traversal instead of post-filtering.
    - **Object-storage vector stores arrived.** Amazon S3 Vectors (GA December
      2025) trades some latency for much lower cost on large, colder corpora, and
      can back Bedrock Knowledge Bases or tier behind OpenSearch.
    - **Quantization is routine.** Scalar (int8), binary, and product
      quantization, often with rescoring, cut memory several-fold. Disk-based
      indexes (DiskANN-style) handle corpora larger than RAM.
    - **Hybrid search is built in** across Postgres extensions, OpenSearch,
      Elasticsearch, Qdrant, Weaviate, Milvus, and the warehouse-native options.

A vector database stores **embeddings** — numeric vectors that capture the
*meaning* of text, images, or other data — and finds the ones most similar to a
query vector. They're the storage/retrieval engine behind semantic search and
RAG.

<!-- RELATED-MODULE -->

## Why vectors?

Traditional databases match **exact** values (`WHERE name = 'Alice'`). But
"how do I cut my cloud bill?" and "reduce AWS costs" share no keywords yet mean
the same thing. Embeddings map both to nearby points in a high-dimensional space,
so **similarity search** finds semantically related content.

```mermaid
flowchart LR
    T1["'reduce AWS costs'"] --> E1[Embedding model]
    T2["'cut my cloud bill'"] --> E1
    E1 --> V1["[0.12, -0.88, ...]"]
    E1 --> V2["[0.14, -0.85, ...]"]
    V1 -.close in vector space.- V2
```

## How similarity search works

1. **Embed** documents (offline) → store vectors + metadata.
2. **Embed** the query (online) → one vector.
3. **Search** for nearest neighbors using a distance metric.
4. Return the top-k with their source text and metadata.

### Distance metrics

| Metric | Meaning | Common for |
|--------|---------|-----------|
| **Cosine similarity** | Angle between vectors (ignores magnitude) | Text embeddings (most common) |
| **Dot product** | Cosine × magnitudes | When magnitude matters |
| **Euclidean (L2)** | Straight-line distance | Image/spatial data |

## ANN indexes (the performance trick)

Exact nearest-neighbor search over millions of vectors is slow. Vector DBs use
**Approximate Nearest Neighbor (ANN)** indexes that trade a tiny bit of accuracy
for huge speed:

| Index | Idea | Trade-off |
|-------|------|-----------|
| **HNSW** | Hierarchical navigable small-world graph | Fast + accurate; more memory |
| **IVF** | Partition into clusters, search a few | Faster build; tune `nprobe` |
| **IVF-PQ** | IVF + product quantization (compress) | Low memory; some recall loss |
| **DiskANN-style** | Graph index on SSD | Corpora bigger than RAM; slightly higher latency |
| **Flat** | Brute force, exact | Small datasets / ground truth |

**Recall vs latency** is the core tuning dial: higher recall (more accurate)
usually means higher latency/memory. HNSW's `ef_search` and IVF's `nprobe`
control it.

## Choosing a vector store

| Option | Type | Notes |
|--------|------|-------|
| **pgvector** | Postgres extension | Great if you already run Postgres; SQL + vectors together |
| **FAISS** | Library (in-process) | Fast, local, no server; you manage persistence |
| **Chroma** | Lightweight, embedded/local | Easy for prototyping |
| **Pinecone** | Managed cloud | Zero-ops, scales; paid |
| **OpenSearch / Elasticsearch** | Search engine with vector support | Strong hybrid (BM25 + vector) if you already run it |
| **Amazon S3 Vectors** | Vector storage in object storage | Very low cost at scale; higher latency than in-memory indexes |
| **Milvus / Weaviate / Qdrant** | Self-host or managed | Feature-rich, filtering, hybrid |
| **Snowflake Cortex Search** | In-warehouse | Governed, no data movement |
| **Databricks Vector Search** | In-lakehouse | Governed alongside Delta data |

## Metadata filtering & hybrid search

- **Metadata filters** — restrict search by tenant, date, source, doc type
  (`WHERE source = 'policy' AND date > ...`) alongside vector similarity.
- **Hybrid search** — combine vector (semantic) with keyword/BM25 (lexical) and
  merge/re-rank. Catches exact terms (codes, names) that pure vectors miss.

```sql
-- pgvector example: nearest neighbors by cosine distance
SELECT id, chunk, 1 - (embedding <=> :query_vec) AS similarity
FROM documents
WHERE tenant_id = :tenant           -- metadata filter
ORDER BY embedding <=> :query_vec    -- <=> = cosine distance
LIMIT 5;
```

## Practical guidance

- **Chunk size drives quality** — the vector represents a chunk; keep chunks
  self-contained (see [RAG](../rag/index.md)).
- **Match the embedding model** to your domain/language, and **use the same
  model** for indexing and querying.
- **Store metadata** with every vector so you can filter and cite.
- **Normalize** vectors if your metric assumes it (cosine).
- **Re-embed** when you change models — vectors from different models aren't
  comparable.

## Interview questions

??? question "What is a vector database and why not just use SQL?"
    It stores embeddings and finds nearest neighbors by semantic similarity, not
    exact matches. SQL `=`/`LIKE` can't capture meaning; vector search returns
    conceptually related items even with no shared keywords.

??? question "What is ANN and why is it needed?"
    Approximate Nearest Neighbor search. Exact search over millions of vectors is
    too slow; ANN indexes (HNSW, IVF) trade a little recall for large speed gains.

??? question "Cosine vs Euclidean vs dot product — when?"
    Cosine for text embeddings (direction = meaning, magnitude ignored); dot
    product when magnitude carries signal; Euclidean for spatial/image data.

??? question "How do metadata filters and hybrid search improve retrieval?"
    Filters constrain results to the right subset (tenant, date, type). Hybrid
    search merges semantic and keyword results so exact terms aren't missed, then
    re-ranks.

??? question "Common causes of poor vector-search results?"
    Bad chunking, mismatched embedding models between index and query, missing
    normalization, no metadata filtering, or relying on pure vectors where keyword
    matching is needed.

---

## Interview deep dive

### 60-second talking points

- **"Vectors capture meaning; search finds nearest neighbors."** Similar meaning →
  nearby points, so you retrieve by concept, not keyword.
- **"ANN trades a little recall for huge speed."** Exact search doesn't scale;
  HNSW/IVF make it fast.
- **"Metadata + hybrid make it production-grade."** Filter by tenant/date and
  merge with keyword search so exact terms aren't missed.

### Scenario & system-design questions

??? question "Choose a vector store for a multi-tenant SaaS RAG feature."
    Need **metadata filtering** (tenant isolation), scale, and low ops. If already
    on Postgres → **pgvector** (SQL + vectors, filter in one place). For managed
    scale → Pinecone/Qdrant/Weaviate. If data lives in Snowflake/Databricks →
    **Cortex Search / Databricks Vector Search** to keep governance. Always filter
    by `tenant_id` in the query.

??? question "Recall is poor at high QPS. What knobs do you turn?"
    Tune the ANN index: HNSW `ef_search` up (better recall, slower) or `M` at
    build; IVF `nprobe` up (search more clusters). Trade latency for recall,
    right-size the index in memory, and consider re-ranking the top-k to recover
    precision.

??? question "Search quality dropped after you switched embedding models. Why?"
    Vectors from different models aren't comparable — you must **re-embed the whole
    corpus** with the new model and query with the same one. Mixed vectors give
    garbage neighbors.

### Pitfalls interviewers probe

- Mismatched embedding models between index and query.
- No metadata filtering (multi-tenant leakage, irrelevant results).
- Wrong distance metric (use cosine for normalized text embeddings).
- Ignoring recall/latency trade-off (default `nprobe`/`ef` too low or high).
- Treating the vector DB as the only retrieval path (skip hybrid/keyword).

### Rapid-fire

| Q | A |
|---|---|
| Why not SQL for this? | Exact match can't capture semantic similarity |
| ANN indexes? | HNSW (graph), IVF (clusters), IVF-PQ (compressed), Flat (exact) |
| Metric for text? | Cosine similarity |
| Recall vs latency knob? | HNSW `ef_search` / IVF `nprobe` |
| Change embedding model → | Re-embed everything |
| Filtered queries returning too few rows? | Use filter-aware ANN / iterative scans (pgvector 0.8+), not post-filtering |

## How interviewers probe this

??? question "Estimate the infrastructure for 500M chunks at 1024 dimensions."
    A strong answer does the math: 500M × 1024 × 4 bytes ≈ 2 TB of raw float32,
    plus HNSW graph overhead. Then it reduces that with int8 or binary
    quantization and rescoring, truncated dimensions, sharding, or disk-based or
    object-storage tiers, and checks recall at each step against a labeled set.

??? question "Postgres + pgvector or a dedicated vector database? Defend it."
    pgvector wins when data already lives in Postgres, scale is moderate, and you
    want transactions, joins, and row-level security in one place. A dedicated
    engine wins at very large scale, high QPS, heavy filtering plus hybrid search,
    or when you want managed scaling. Name the operational cost of running a
    second datastore.

??? question "How do you guarantee tenant isolation in a shared vector index?"
    Enforce the tenant filter server-side in every query (never trust the
    client), consider namespaces or separate collections for large or regulated
    tenants, test with cross-tenant canary documents, and audit retrieved IDs
    against the caller's tenant.

??? question "Index rebuilds take hours and block deploys. What do you change?"
    Build new indexes side by side and switch an alias, ingest incrementally
    rather than rebuilding, tune build parameters (`M`, `ef_construction`) against
    recall needs, and separate the index build pipeline from application deploys.
