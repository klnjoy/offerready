---
icon: material/database-search
---

# RAG & LLMOps Interview Q&A — Senior & Scenario-Based

*Last reviewed: October 2026*

These questions cover retrieval-augmented generation and the operational discipline around LLM systems. Senior interviewers look for engineers who treat retrieval as a measurable search problem, ship prompts and models like code, and can explain exactly how they would detect and fix a quality regression.

## Core concepts

??? question "How do you choose a chunking strategy for a RAG system?"
    **Short answer:** Chunk along the document's natural structure, size chunks to hold one coherent idea, and validate the choice with retrieval metrics rather than intuition.

    **In depth:** Fixed-size chunks with overlap are a reasonable baseline but split tables, code and arguments mid-thought. Structure-aware chunking uses headings, sections, list items or code blocks, and carries metadata such as title, section path, source and date. Too small loses context and confuses the generator; too large dilutes embeddings and wastes tokens. Useful patterns include parent-child retrieval (match small chunks, return the larger parent section) and prepending a short document-level context to each chunk before embedding. Tables and slides often need special parsing. Always compare strategies on the same eval set using recall at k and answer quality.

    **Follow-up they'll ask:** What chunk size do you start with? A few hundred tokens with modest overlap, then tune using evals.

??? question "How do you pick an embedding model, and what happens when you change it?"
    **Short answer:** Choose on retrieval quality for your domain and languages, plus dimension size, latency, cost and hosting constraints; changing it means re-embedding the whole corpus.

    **In depth:** Public leaderboards are a starting point, but test candidates on your own queries and documents, because domain jargon and multilingual content change rankings. Larger dimensions improve quality at higher storage and search cost; some models support truncated dimensions to trade quality for size. Self-hosting helps with data residency and cost at scale. Vectors from different models are not comparable, so an upgrade needs a new index built in parallel, evaluated, and switched atomically, with query and document embeddings always from the same model version. Record the model version in index metadata.

    **Follow-up they'll ask:** Can you fine-tune embeddings? Yes, with query and positive passage pairs, which often helps narrow domains noticeably.

??? question "What is hybrid search and why does it usually beat pure vector search?"
    **Short answer:** Hybrid search combines lexical retrieval such as BM25 with dense vector retrieval and fuses the results, capturing both exact terms and semantic similarity.

    **In depth:** Dense embeddings are strong at paraphrase and meaning but weak on exact identifiers, product codes, error messages, names and rare terms, which BM25 handles well. Running both and merging with reciprocal rank fusion or weighted scores improves recall across query types without fragile tuning. Many vector databases and search engines now support hybrid queries natively. Metadata filters such as tenant, date, product and permissions should apply in both retrievers. Measure recall at k for each retriever separately and fused, broken down by query type, to show the gain is real.

    **Follow-up they'll ask:** Why reciprocal rank fusion? It uses ranks rather than raw scores, so it works even when the two scoring scales are incomparable.

??? question "What does a reranker add to a retrieval pipeline, and what does it cost?"
    **Short answer:** A cross-encoder reranker scores each query and candidate pair jointly, giving much better precision at the top of the list, at the cost of added latency per candidate.

    **In depth:** First-stage retrieval optimises recall cheaply over millions of chunks; the reranker optimises precision over the top 20 to 100 candidates. Because it reads query and passage together, it captures relevance that bi-encoder similarity misses. This lets you send fewer, better chunks to the LLM, which cuts tokens and reduces distraction. Costs are latency (tens to hundreds of milliseconds depending on model and candidate count) and compute. Tune the candidate count against latency budget, and measure precision at small k and final answer quality before and after.

    **Follow-up they'll ask:** Can an LLM rerank? Yes, but it is slower and pricier; use it for offline evaluation or high-value queries.

??? question "How do you choose a vector database and index type such as HNSW or IVF?"
    **Short answer:** Decide on operational needs first, such as filtering, hybrid search, scale, multi-tenancy and hosting, then pick an index: HNSW for low-latency high recall in memory, IVF variants for larger or memory-constrained corpora.

    **In depth:** HNSW builds a navigable graph with strong recall and latency, but uses more memory and is slower to build; parameters such as M and ef trade recall for speed. IVF clusters vectors and searches only nearby lists, which is memory-friendlier and pairs with product quantisation for large corpora, at some recall cost. Filtered search is a common trap: restrictive filters can wreck recall in some implementations, so test with real filters. For smaller corpora, pgvector inside an existing Postgres is often enough and simplifies permissions and transactions. Benchmark recall against exact search on your own data.

    **Follow-up they'll ask:** When do you need a dedicated vector DB? At large scale, heavy filtered or hybrid workloads, or strict latency SLOs that a general database cannot meet.

??? question "How do you enforce access control in retrieval so users only see what they are allowed to?"
    **Short answer:** Store permissions as metadata on every chunk, resolve the user's identity and groups at query time, and filter inside the search, never only in the prompt.

    **In depth:** Copy ACLs from source systems during ingestion, including group ids, and keep them in sync when permissions change. At query time, derive the user from a verified token, expand group membership from the identity provider, and pass a mandatory filter to the retriever. Do not rely on the LLM to hide restricted content; once text is in the context, it can leak. Post-filtering after top k can return empty results and makes leaks easier through caching. Caches must be keyed by permission scope. Test with negative cases: users who should see nothing must get nothing.

    **Follow-up they'll ask:** How fast must revocation apply? Define an SLA; for sensitive data, check the source system's permission at query time as well.

??? question "How do you evaluate a RAG system, and what are the pitfalls of LLM-as-judge?"
    **Short answer:** Evaluate retrieval and generation separately: recall at k and MRR for retrieval, and faithfulness, relevance and correctness for answers, using a curated golden set plus production samples.

    **In depth:** Build a golden set of real questions with expected sources and reference answers, covering edge cases and unanswerable questions. Retrieval metrics tell you whether the right chunk was found; generation metrics tell you whether the model used it faithfully. LLM-as-judge scales scoring, but judges show position bias, verbosity bias, self-preference for their own model family, and inconsistency across runs. Mitigate with clear rubrics, pairwise comparison with swapped order, low temperature, and calibration against human labels with agreement measured. Track scores over time in CI so prompt or model changes cannot silently regress.

    **Follow-up they'll ask:** How big should a golden set be? Start with a few hundred well-chosen cases and grow it from production failures.

??? question "How do you manage prompts and their versions in production?"
    **Short answer:** Treat prompts as versioned artifacts with owners, tests and change history, deployed through the same review, eval and rollout process as code.

    **In depth:** Store prompts in the repository or a prompt registry, each with a version id, the model it was validated on, and its parameters. Every trace records the prompt version, so you can attribute quality changes. Changes go through code review and an automated eval suite before release. Separate templates from runtime variables, and keep system prompts free of secrets. Feature flags or a registry allow switching versions without redeploying, but this must still be audited. Prompts tuned for one model often degrade on another, so a model change means re-evaluating prompts.

    **Follow-up they'll ask:** Who can edit prompts? Owners via reviewed changes; non-engineers can propose edits in a registry with eval gates.

## Scenarios

??? question "Users say the RAG assistant gives confident wrong answers — how do you diagnose it?"
    **Short answer:** Pull traces for failing cases and classify each one: retrieval missed the right content, the content was wrong or stale, or the model ignored or misread good context.

    **In depth:**
    - Retrieval miss: check recall at k on these questions; fix chunking, hybrid search, query rewriting or filters.
    - Stale or conflicting sources: check ingestion freshness and duplicates; add dates and source priority.
    - Generation failure: the right chunk was present but ignored; tighten instructions, reduce noise via reranking, or try a stronger model.
    - Unanswerable questions: add explicit 'not found' behaviour and confidence thresholds.

    Add the failing cases to the golden set, fix the biggest bucket first, and require citations so users and judges can verify claims.

    **Follow-up they'll ask:** How do you measure improvement? Re-run the eval suite and track faithfulness and correctness per failure category.

??? question "Your index is out of date and users see deleted or old documents — how do you fix freshness?"
    **Short answer:** Move from periodic full rebuilds to incremental, event-driven sync with explicit delete handling, and monitor freshness lag as a metric.

    **In depth:** Use change events, webhooks or change data capture from source systems, and store a content hash per document so only changed documents are re-chunked and re-embedded. Deletes and permission changes must propagate quickly, which is often the most neglected path; tombstone and purge chunks by document id. Keep stable chunk ids so updates replace rather than duplicate. For large model or chunking changes, build a new index in parallel and swap with an alias. Expose freshness lag per source and alert when it exceeds the SLA. Add document dates to metadata so retrieval can prefer recent versions.

    **Follow-up they'll ask:** What if the source system has no change feed? Poll with modified timestamps and run periodic reconciliation to catch deletes.

??? question "Your RAG endpoint's p95 latency is eight seconds — how do you bring it down?"
    **Short answer:** Break latency down by stage with tracing, then attack the biggest stages: usually generation length, context size, sequential calls and cold retrieval.

    **In depth:**
    - Stream tokens so time to first token, not total time, drives perceived latency.
    - Cut context: fewer, better chunks via reranking reduce prompt processing time.
    - Parallelise independent steps such as multiple retrievals and query rewriting.
    - Use a smaller, faster model for query rewriting, classification and routing.
    - Use provider prompt caching for long, shared system prompts.
    - Cache embeddings for frequent queries and keep indexes warm in memory.
    - Cap output tokens and ask for concise answers.

    Measure each change against the p95 and against quality evals so latency wins do not cost accuracy.

    **Follow-up they'll ask:** Which single change usually helps most? Streaming plus smaller context, because prompt size and output length dominate.

??? question "LLM costs tripled after launch — how do you reduce them without hurting quality?"
    **Short answer:** Attribute cost by feature, tenant and model, then apply routing, caching, context trimming and output limits, validating each change with evals.

    **In depth:** First find where tokens go: often a few features, long system prompts, agent loops or retries dominate. Route simple requests to smaller models using a classifier or rules, and reserve the strongest model for hard cases. Use exact-match caching for repeated requests and provider prompt caching for shared prefixes. Semantic caching can help for FAQ-like traffic but needs a strict similarity threshold and permission-aware keys. Trim retrieved context, cap max tokens, and move offline workloads to cheaper batch APIs. Add per-tenant budgets and alerts so a runaway loop is caught in hours, not at month end.

    **Follow-up they'll ask:** What is the risk of semantic caching? Returning a cached answer to a subtly different question or to a user without access.

??? question "How would you implement model routing across several LLMs?"
    **Short answer:** Classify each request by difficulty, task type, risk and latency need, then send it to the cheapest model that meets the quality bar, with fallbacks when a model fails.

    **In depth:** Start with simple rules such as task type and tenant tier, then add a lightweight classifier trained on eval outcomes showing which model succeeds for which requests. Cascades try a small model first and escalate if confidence or a validator fails, which saves cost but adds latency on escalations. Every route needs its own eval coverage and monitoring, because averages hide regressions in slices. Fallbacks across providers improve availability but need prompts validated on each model. Log the routing decision in the trace so you can analyse quality and cost per route.

    **Follow-up they'll ask:** How do you prevent routing drift? Re-run routing evals when models or traffic change, and review per-route quality weekly.

??? question "How do you safely roll out a new prompt or model version, and roll it back?"
    **Short answer:** Gate on offline evals, then use shadow traffic or a canary with online metrics, and keep the previous version deployable behind a flag for instant rollback.

    **In depth:** Offline: run the candidate on the golden set and compare with the current version on quality, safety, latency and cost. Shadow: send a copy of real traffic to the candidate without showing users, and compare outputs with a judge or human sampling. Canary: route a small percentage of users, watching thumbs down rate, escalations, guardrail triggers, latency and cost per request. Promote gradually. Rollback is a config change because prompt and model versions are flags, not code deploys. Pin model snapshots where providers offer them, since floating aliases can change underneath you.

    **Follow-up they'll ask:** What is a good automatic rollback signal? A statistically significant rise in negative feedback or guardrail failures against the control group.

??? question "Answer quality has slowly degraded over three months with no code changes — what is happening and what do you do?"
    **Short answer:** Something drifted: user queries, the corpus, upstream models behind floating aliases, or data pipelines, so compare current behaviour against baselines to find which one.

    **In depth:**
    - Query drift: new topics or products appear that the corpus or prompts do not cover; cluster recent queries and compare with the eval set.
    - Corpus drift: duplicates, stale versions or broken parsing after a source format change.
    - Model drift: a provider updated the model behind an alias; check model ids in traces.
    - Retrieval drift: index growth changed recall or filter behaviour.

    Detect earlier by running the golden set on a schedule, sampling production traffic for judged evals, and monitoring embedding distribution and retrieval score trends.

    **Follow-up they'll ask:** How do you keep the eval set relevant? Add sampled production queries and failure cases every month.

??? question "What guardrails do you put around a production RAG or LLM application?"
    **Short answer:** Layer input checks, retrieval controls, output validation and policy filters, and measure guardrails for false positives as well as catches.

    **In depth:** Input guardrails detect prompt injection attempts, block disallowed topics and redact PII before it reaches the model or logs. Retrieval guardrails enforce permissions and mark retrieved text as untrusted data. Output guardrails validate structure against a schema, check citations reference retrieved chunks, filter unsafe content and detect leaked secrets or PII. Choose between fast classifiers, rules and LLM checks based on latency budget. Guardrails that block too much frustrate users, so track block rates, sample blocked requests for review and tune thresholds. Treat guardrails as defence in depth, not a substitute for least privilege.

    **Follow-up they'll ask:** Do guardrails add latency? Yes, so run cheap checks inline and heavier ones in parallel or asynchronously where risk allows.
