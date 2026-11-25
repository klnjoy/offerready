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

??? question "How do you choose top-k for retrieval, and what happens if you raise or lower it?"
    **Short answer:** Pick k from measurements, not a habit: find where recall on your evaluation set stops improving, then check that the generator still answers well with that many chunks.

    **In depth:** A small k is cheaper and keeps the context focused, but the chunk that holds the answer may not be in it, so recall drops and the model guesses. A large k raises recall but adds noise, cost and latency, and models can miss facts buried in the middle of a long context. A common pattern is to retrieve generously (a wider candidate set) and then rerank down to a few chunks for the prompt, so recall and precision are tuned separately. Make k depend on the question type when needed: a lookup needs few chunks, a summary across many documents needs more. Measure recall at several values of k and answer quality on the same set before choosing.

    **Follow-up they'll ask:** Recall is fine at k=20 but answers are worse than at k=5. Why? Extra chunks add distractors; add a reranker or tighten the prompt to cite only relevant sources.

??? question "How would you make complex PDFs with tables, charts and multi-page sections searchable through RAG?"
    **Short answer:** Parse layout first, not just text: extract tables as structured rows, describe charts in words, keep sections whole across pages, and store page and section metadata so answers can cite them.

    **In depth:** Plain text extraction scrambles tables and loses headings. Use a layout-aware parser (or OCR for scanned pages) that returns blocks with their type. Tables: keep them as markdown or rows with their header repeated, and index a short summary of each table alongside it. Charts and figures: store the caption plus a generated description, flagged as derived, and link back to the page. Multi-page sections: chunk by the document's structure rather than by page, so a table or argument that crosses a page break stays together. Keep metadata (document, page, section, table id) for citations and filters. Check quality with questions whose answers sit in tables and figures, because those fail first.

    **Follow-up they'll ask:** How do you answer a numeric question over a large table? Retrieve the table, then compute with a tool or query rather than asking the model to do the arithmetic in text.

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

??? question "Cosine similarity, dot product or Euclidean distance: which do you use for embeddings, and does it matter?"
    **Short answer:** Use the metric the embedding model was trained for, usually cosine or dot product on normalized vectors; if vectors are normalized the three give the same ranking.

    **In depth:** Cosine compares direction and ignores length. Dot product also rewards length, which some models use as a signal. Euclidean distance on unit-length vectors is a monotonic function of cosine, so the ranking does not change. The mistakes that hurt are mixing metrics: indexing with one and querying with another, or comparing vectors from two different models, which live in different spaces and cannot be compared at all. Check the model card, normalize at write time if the index expects it, and keep the metric in the index config under version control.

    **Follow-up they'll ask:** What happens if some vectors are normalized and some are not? Rankings become unreliable, because long vectors win on dot product for reasons unrelated to relevance.

??? question "Approximate nearest-neighbour search is not exact. How do you know it is finding the right chunks?"
    **Short answer:** Measure ANN recall against exact search on a sample of real queries, then tune the index until recall is high enough at a latency you can afford.

    **In depth:** Indexes such as HNSW and IVF trade accuracy for speed through parameters like the number of neighbours searched or probes. Take a few hundred real queries, run brute-force search to get the true top-k, and compare it with the index result: the overlap is the ANN recall. Raise the search effort until recall stops improving or latency becomes too high. Do this again when the corpus grows a lot or the index type changes. Poor answers can come from retrieval quality (the embedding or chunking) or from index recall, and this test separates the two.

    **Follow-up they'll ask:** Why not always use exact search? It is fine for small corpora, but cost and latency grow linearly with the number of vectors.

??? question "Embedding storage and search cost are growing. What can you do without retraining the model?"
    **Short answer:** Reduce vector size with lower precision or truncated dimensions, filter before searching, and only embed what users will search; then re-check retrieval quality.

    **In depth:** Storing vectors at 8-bit instead of 32-bit float cuts memory by about four times, with a small quality loss on most models. Some models are trained so that the first dimensions carry most of the meaning, which lets you keep a shorter prefix. Metadata filters and per-tenant partitions shrink what each query searches. Drop duplicate and boilerplate chunks before embedding. Each change should be tested on a fixed set of queries with recall and answer quality, not accepted because the bill went down.

    **Follow-up they'll ask:** What would you try first? Deduplication and filtering, because they cost nothing in quality.

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

??? question "Answer quality dropped right after you added a batch of new documents. How do you trace it?"
    **Short answer:** Walk the pipeline in order, ingestion, retrieval, reranking and generation, comparing failing questions before and after the change, so you find the first stage that went wrong.

    **In depth:**

    - **Ingestion:** did the new documents parse cleanly, with the same chunking and the same embedding model version? Look for empty or garbled chunks and duplicates.
    - **Retrieval:** for questions that got worse, are the right chunks still in the top results, or are new near-duplicate or lower-quality chunks crowding them out? Compare recall at k before and after.
    - **Reranking:** does the reranker now prefer the new chunks for the wrong reasons, such as length or keyword overlap?
    - **Generation:** if the right chunks are in the prompt, is the answer wrong because sources now conflict (an old and a new version of a policy)?

    Fixes follow the stage: clean or exclude bad documents, deduplicate, add metadata filters or recency, tune the reranker, or tell the model how to resolve conflicts and cite. Add the failing questions to the evaluation set so the next batch is checked before release.

    **Follow-up they'll ask:** How do you stop this happening again? Run the evaluation set automatically on every index update and block the swap if quality drops.

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

??? question "How would you introduce prompt caching in your system?"

    **Short answer:** Cache the stable prompt prefix — system prompt, tool definitions, few-shot examples, long static documents — so it is processed once and reused, and measure hit rate and cost before claiming a win.

    **In depth:** Start from what actually repeats: prompt caching reuses the computation for an identical prompt prefix, it does not cache the answer. Put the stable content first and the changing user question last, in the same order every time, because both Anthropic and OpenAI cache by exact prefix match and one changed token early invalidates everything after it. On Anthropic you mark cache breakpoints explicitly (up to four), typically after the system prompt and after a long document; OpenAI caches automatically for long prompts. Cached prefixes expire — about 5 minutes by default on Anthropic, extendable to 1 hour at higher write cost; OpenAI eviction is best-effort. Cache writes cost more than a normal token and cache reads cost much less, so it only pays off if the same prefix is reused inside the TTL. Log cache-read and cache-write tokens, hit rate, time to first token and cost per request, and roll out behind a flag. Example: a support bot sending a 4,000-token system prompt plus product manual on every call caches after the manual, so follow-up messages in the session read the repeated prefix from cache instead of reprocessing it.

    **Follow-up they'll ask:** The prefix changes on every request — what breaks? Nothing ever hits; find the varying token (a timestamp in the system prompt is the classic one) and move it after the breakpoint.

??? question "How do you cache semantically similar prompts?"

    **Short answer:** Cache finished answers keyed by meaning: embed the prompt, search a vector store for a near neighbour, and return the stored answer when similarity clears a tuned threshold — otherwise call the LLM and store the new pair.

    **In depth:** Embed the normalised incoming question with the same model used for stored entries, then look up nearest neighbours in a vector store — Redis with vector search, pgvector, or a dedicated store; GPTCache is the common open-source pattern for this whole flow. Compare by cosine similarity and return the cached answer only above a high threshold tuned on real traffic, often around 0.90–0.97 depending on the embedding model. Below the threshold, call the LLM and store the new question, embedding and answer. Scope every entry by tenant, user segment, language, model and prompt version, and never serve one user's personalised answer to another. Add a time-to-live and a way to flush entries when the underlying facts, documents or prompt change. Example: "How do I reset my password?", "Password reset steps?" and "I forgot my password, help" embed close together — the first goes to the LLM, the next two hit the cache and return instantly at almost no model cost.

    **Follow-up they'll ask:** What if two similar questions need different answers? That is a false positive — see the trade-offs question; keep the threshold high and never cache high-stakes answers.

??? question "What are the trade-offs of semantic caching?"

    **Short answer:** It trades correctness risk for speed and cost — the whole answer is how you control that risk: false positives, false negatives, staleness, personalisation, lookup cost and cache poisoning.

    **In depth:** False positives: two questions can be similar but need different answers ("refund for a monthly plan" vs "refund for an annual plan") — control with a high threshold and never cache high-stakes or highly specific answers. False negatives: a threshold set too high means paraphrases miss and you pay for the embedding lookup with no saving — tune the threshold on logged real queries, not guesses. Staleness: prices, policies and documents change while a cached answer does not — control with TTLs, versioning by document and prompt version, and instant invalidation on content updates. Personalisation and privacy: if answers depend on the user, account or permissions, a shared cache leaks context — scope by tenant and segment, and exclude personalised prompts entirely. Cost of the lookup itself: every request now pays for an embedding call and a vector search, so it only wins if hit rate times LLM saving beats that overhead. Cache poisoning: bad or adversarial entries can be stored and then served to many people — only cache answers that passed your quality checks, and monitor hit answers. Example: cache FAQs and how-to answers aggressively; do not cache account-specific, medical, legal or pricing-negotiation answers at all.

    **Follow-up they'll ask:** When would you not use semantic caching at all? When answers are personalised, high-stakes, or change faster than your invalidation can keep up.

??? question "What is the difference between prompt caching and semantic caching?"

    **Short answer:** Prompt caching stores the processed state of a prompt prefix inside the model provider; semantic caching stores a finished answer in your own vector store. One caches computation, the other caches answers — and they stack.

    **In depth:** What is stored: prompt caching stores the processed attention / key-value state of a prompt prefix; semantic caching stores a finished answer. What must match: prompt caching needs an exact, token-for-token prefix match; semantic caching needs only similar meaning, so wording can differ. Who provides it: prompt caching is a provider feature (Anthropic, OpenAI); semantic caching is application logic you build and own. When it helps: prompt caching helps long, repeated contexts — big system prompts, documents, chat history; semantic caching helps many different users asking the same question in different words. They combine: semantic cache first for a whole-answer hit, and on a miss prompt caching still makes the LLM call itself cheaper and faster. Example: a document Q&A bot uses prompt caching for the 20-page manual sent every time, and a semantic cache for the ten questions every new user asks in their own words.

    **Follow-up they'll ask:** Which saves more? It depends on traffic: repeated long contexts favour prompt caching, repeated questions in different words favour semantic caching — measure both.

??? question "Evals in AI — how do you build and run evals for an LLM feature?"

    **Short answer:** Build a golden set of real cases, score it in layers (programmatic checks, LLM-as-judge, human spot-checks), gate releases on it offline, and keep monitoring online.

    **In depth:** Build a golden set of 100–300 representative cases from real traffic — the input, the expected behaviour, and what "good" looks like — including edge cases and past failures, and refresh it as the product changes. Score in layers: exact or programmatic checks where you can (format, required facts present, tool called correctly), then LLM-as-judge with a clear rubric for quality, faithfulness and tone, then human spot-checks on a sample, because the judge itself needs checking. Track task success or accuracy, hallucination or faithfulness rate, refusal rate, latency and cost per successful answer — one average score hides regressions. Run the set offline as a regression gate: every prompt, model or retrieval change runs it before release, and a drop on any important slice blocks the change like a failing unit test. Run online after release: log real inputs, outputs and user signals (thumbs, retries, escalations) and feed real failures back into the golden set so the same bug cannot return silently. Example: before swapping models for a support bot, run both on the same 200-case golden set — the cheaper model wins on cost but fails returns-policy cases, so ship it for general chat only and keep the stronger model for returns.

    **Follow-up they'll ask:** How do you stop the LLM judge from being biased? Clear rubrics, pairwise comparison with swapped order, low temperature, and calibration against human labels with agreement measured.

??? question "Why is this chatbot failing?"

    **Short answer:** Do not guess — name the failure mode precisely, reproduce it with one real case, then work layer by layer from the outside in: retrieval, prompt and context, model and infrastructure.

    **In depth:** Wrong answers, refusals, timeouts, empty replies and errors are different bugs, so get the failure rate, when it started, and whether it affects all users or one segment. Reproduce with one real failed conversation, with its exact prompt, retrieved context and model settings — if you cannot reproduce it, you are speculating. Check retrieval before the model: in most RAG bots the model is blamed for bad retrieval — wrong chunks, stale index, empty results, or the right chunk ranked too low to be included. Check the prompt and context: truncated history, instructions buried or contradicted, context over the limit, or a recent prompt change that correlates with the start date. Check model and infrastructure: model version change, rate limits, timeouts, tool or API failures, and silent fallbacks — correlate the start of failures with deploys and provider changes. Then fix, add the case to evals, and monitor, so every real failure becomes a regression case. Example: "the bot started making up policy" the day after a release — the prompt had not changed, the document index rebuild had dropped the returns document, so the fix was re-indexing, not a better prompt.

    **Follow-up they'll ask:** What do you do when you cannot reproduce it? Log the full trace (prompt version, retrieved chunks, model version) for failing requests so the next one is reproducible.

??? question "Why is the chatbot so slow?"

    **Short answer:** Break total time into pieces before optimising anything: time to first token, generation time, and everything before the model — then fix the largest slice.

    **In depth:** Time to first token is driven by prompt size: a huge system prompt, full chat history and many retrieved chunks must all be processed before the first token — fix with prompt caching, trimmed history, and fewer, better chunks. Generation time is output length times model speed: a large, slow model writing a long answer feels slow even with good time to first token — right-size the model, cap unnecessary length, use a faster model for simple turns. If you wait for the full answer before showing anything, perceived latency is the total time — streaming the first tokens early is often the single biggest felt improvement. Work before the model also adds up: slow retrieval, embedding calls, sequential API or tool calls, cold starts and network hops — parallelise independent calls, cache, and set timeouts. Log time to first token, tokens in and out, retrieval time and tool time per turn, and optimise the largest slice first. Example: a bot taking 9 seconds — 3 seconds retrieving from two sources in sequence, 4 seconds processing a 12,000-token prompt with no caching, 2 seconds generating — parallel retrieval plus prompt caching plus streaming makes it feel near-instant with no model change.

    **Follow-up they'll ask:** Users say it feels slow but your p50 looks fine — what do you check? The tail: p95/p99, the slowest turns, and whether the slow slice is retrieval, tools, or generation.

??? question "How do you compare LLM providers on price? What does per-million-token pricing hide?"

    **Short answer:** Compare on the tokens you actually use — input versus output rates, and what counts as a token — not on the headline number. Two providers with the same per-million price can cost very differently for the same workload.

    **In depth:** Input tokens are usually cheaper than output tokens, and reasoning models bill thinking tokens as output, so a provider that looks cheap on input can be expensive if your prompts are long or the model writes long answers. Cached input is often billed at a discount, but only if the cache hits — measure your hit rate before counting the saving. Tokenisers differ, so the same text is a different number of tokens on different models; compare on cost per successful task, not cost per million tokens, by running the same real requests through each provider and dividing total spend by completed tasks. Watch what is not in the per-token price: rate limits that force retries, minimum charges, and storage or egress for hosted models. Re-check quarterly — provider prices move, and the cheapest model for your workload changes with them.

    **Follow-up they'll ask:** When would you pay more per token on purpose? When the cheaper model fails more often and the retries, fallbacks and support cost erase the saving.

??? question "How do you charge token spend back to the teams or products that caused it?"

    **Short answer:** Tag every model call with who it was for, measure tokens per tag, and report the bill in those terms — otherwise token spend lands in one shared bucket nobody owns.

    **In depth:** Pass a tag — team, product, feature, tenant — with every call, in the request metadata or a header, and log input tokens, output tokens and cache hits per tag. Publish a simple monthly report: tokens and spend by team and by feature, with the top drivers named. Chargeback means the team's budget actually pays it; showback means they only see the number — start with showback, because it changes behaviour without a billing fight. Set a budget per team with an alert at 80 percent, not a hard cutoff that breaks their product. Review the top three drivers every month: usually one prompt that is too long, one feature calling the model in a loop, or one team that never enabled caching.

    **Follow-up they'll ask:** What if a team says the shared platform should pay? Shared infrastructure costs are shared; the tokens a team's feature consumes are theirs — the tag makes that visible.

??? question "How do you evaluate guardrails? How do you know if they are too strict or too loose?"

    **Short answer:** Build a test set with cases that should be blocked and cases that should pass, then measure false positives and false negatives separately — one average score hides both failures.

    **In depth:** Two sets: harmful cases that must be blocked — disallowed content, PII, injection attempts — and benign cases that must pass, including edge cases that look risky but are legitimate, like medical questions or security discussions. Measure the block rate on each: false negatives are harmful content getting through; false positives are real users being refused. Track both, because tightening the filter fixes one and causes the other. Re-run the set on every guardrail change like a regression test, and add every real miss — a blocked legitimate user or a harmful answer that slipped through — back into the set. Use human review on a sample, because automated judges share the guardrail's blind spots.

    **Follow-up they'll ask:** What is an acceptable false-positive rate? It depends on the stakes: near zero for a customer-facing helper, higher for an internal tool where a refusal is a minor annoyance.

??? question "A guardrail blocks a legitimate request. What should the user see, and what happens next?"

    **Short answer:** A short, honest refusal that says what happened and what to do next — never a silent failure, a fake answer, or a technical error dump.

    **In depth:** Tell the user plainly that the request could not be completed as asked, in one sentence, without quoting the blocked content back or explaining the rule in a way that teaches evasion. Offer the next step: rephrase the request, ask a narrower question, or contact a human. Log the block with the request, the rule that fired and the context, so you can tell a real block from a false positive. Give users a way to appeal — a feedback button or a support path — and review appeals weekly, because each one is a test case for the guardrail. If the same legitimate request keeps getting blocked, fix the rule or the filter, not the user.

    **Follow-up they'll ask:** Should you ever show the user which rule fired? No — it tells attackers exactly what to work around.

??? question "Guardrails add latency and cost to every call. How do you keep them fast and cheap?"

    **Short answer:** Put the cheap check first, the expensive check only where it is needed, and cache decisions that repeat — most calls need a small classifier, not a second LLM.

    **In depth:** Layer the checks: a fast rule or small classifier screens every request, and only ambiguous cases go to a larger model for judgement. That keeps the common path to a few milliseconds. Cache guardrail decisions for repeated inputs — the same prompt, the same retrieved chunk — so you do not pay twice. Run checks in parallel with retrieval where possible, so the guardrail does not add a serial step before the model. Measure the cost: guardrail tokens and time per request, as a share of the total — if the guardrail costs more than the answer, the design is wrong. Accept the trade-off openly: a lighter guardrail is faster and cheaper but misses more; document where you set the line.

    **Follow-up they'll ask:** When is a second LLM as a guardrail worth it? When the cost of a miss — a harmful answer reaching a customer — is far higher than the extra call.
