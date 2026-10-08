---
icon: material/tune
---

# Retrieval Tuning: Top-K, Filtering & Reranking

*Last reviewed: October 2026*

The three levers that most affect RAG quality after chunking/embeddings:
**how many** candidates you fetch (Top-K), **which** you keep (filtering), and
**in what order** (reranking).

<!-- RELATED-MODULE -->

## The retrieve → filter → rerank pipeline

```mermaid
flowchart LR
    Q[Query] --> R[Retrieve Top-K wide, e.g. 50]
    R --> F[Metadata filter: tenant, date, type]
    F --> RR[Rerank: cross-encoder]
    RR --> N[Keep top-n, e.g. 5]
    N --> CTX[Into context]
```

## Top-K retrieval

**Top-K** = how many candidate chunks the vector search returns.

- **Too small** → you miss the relevant chunk entirely (recall problem).
- **Too large** → noise, cost, and "lost in the middle" dilution.
- **Pattern:** retrieve a **wide K** (e.g. 30–50) as candidates, then **rerank**
  and keep a **small n** (e.g. 3–5) for the prompt. Wide recall, narrow precision.

## Filtering (pre/post)

Constrain candidates by **metadata** alongside similarity:

- **Pre-filter** — restrict the search space before/within the vector search
  (e.g. `tenant_id = X`, `date > ...`, `doc_type = 'policy'`). Essential for
  multi-tenant isolation and freshness.
- **Post-filter** — drop results after retrieval (simpler, but can leave you with
  fewer than n if the filter is aggressive).

Filtering is about **correctness and security**, not just relevance — a missing
tenant filter leaks data.

## Reranking

The first-stage retriever (bi-encoder / vector similarity) is fast but
approximate. A **reranker** (cross-encoder) scores each (query, chunk) pair
jointly — slower but far more accurate — and reorders the candidates.

| Stage | Model | Speed | Accuracy |
|-------|-------|-------|----------|
| Retrieve | Bi-encoder (embeddings) | Fast (index) | Approximate |
| Rerank | Cross-encoder | Slow (per pair) | High |

Because reranking is expensive per pair, you **only rerank the Top-K
candidates**, not the whole corpus. Options: hosted rerankers (Cohere Rerank,
Voyage rerank, Bedrock rerank models), open cross-encoders (for example the BGE
reranker family), or an LLM as reranker for the hardest cases.

## Filtering vs reranking (the key distinction)

- **Filtering** = binary include/exclude by metadata (correctness, security).
- **Reranking** = reorder by relevance score (quality).

They're complementary: filter to the *allowed and fresh* set, then rerank that
set for *best first*.

## Interview deep dive

### Talking points
- **"Retrieve wide, rerank narrow."** High recall then high precision.
- **"Filtering is correctness/security; reranking is quality."**
- **"Reranking is a cross-encoder on the Top-K, not the whole corpus."**

### Scenario questions

??? question "Recall is fine but the best answer is buried at rank 8. What do you add?"
    A **reranker** (cross-encoder). The bi-encoder retrieved the right chunk but
    scored it imprecisely; a cross-encoder rescoring the Top-K promotes it. Keep a
    small top-n after reranking.

??? question "Multi-tenant RAG occasionally returns another tenant's doc. Fix?"
    **Pre-filter** by `tenant_id` inside the vector query (metadata filter), not
    just in the UI. This is a security bug, not a relevance one.

??? question "How do you choose K?"
    Big enough for recall (measure context recall on an eval set), then rerank down
    to the smallest n that keeps faithfulness high — balancing cost and "lost in
    the middle."

### Rapid-fire

| Q | A |
|---|---|
| Top-K? | How many candidates retrieval returns |
| Retrieve wide, then? | Rerank and keep a small top-n |
| Filtering vs reranking? | Include/exclude by metadata vs reorder by relevance |
| Reranker type? | Cross-encoder (joint query-chunk scoring) |
| Why not rerank everything? | Cross-encoders are expensive per pair |

## How interviewers probe this

??? question "Filtered vector search returns too few results for small tenants. Why, and how do you fix it?"
    A strong answer explains the interaction between ANN indexes and filters:
    post-filtering an HNSW top-K can leave almost nothing for a tenant with few
    documents. Fixes: true pre-filtering or filter-aware search (for example
    pgvector's iterative index scans or native filtered HNSW), per-tenant
    partitions or indexes for large tenants, or raising K adaptively, and
    measuring recall per tenant size.

??? question "How do you set K, n, and the reranker budget with numbers, not guesses?"
    Build a labeled set, plot recall@K for the first stage and final quality
    against n after reranking, then pick the knee of each curve subject to the
    latency budget (reranker cost grows linearly with K). Re-check when the
    corpus or embedding model changes.

??? question "How do you merge dense and keyword results before reranking?"
    Use Reciprocal Rank Fusion (score-free and robust) or weighted normalized
    scores, tune the weights on the eval set, deduplicate by chunk ID, and then
    rerank the fused list. Explain why raw scores from BM25 and cosine similarity
    aren't directly comparable.

??? question "Reranking added 300 ms to p95. What are your options?"
    Rerank fewer candidates, use a smaller or distilled reranker, run it on a
    GPU, cache results for popular queries, rerank only when first-stage
    confidence is low, or stream the answer while reranking runs on a narrowed
    set. Measure the quality cost of each option.
