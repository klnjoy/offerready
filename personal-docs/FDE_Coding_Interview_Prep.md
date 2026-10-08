---
icon: material/code-braces
---

# FDE / Solutions Engineer - Coding Interview Prep

*Last reviewed: October 2026*

**SQL + Python + Snowflake Cortex + System Design**

Target: NVIDIA, Snowflake, Databricks, AWS FDE/SE roles

---

## Part 1: SQL Problems (Most Common in FDE Interviews)

### Q1: Window Functions - Running Total
Write a query to show each transaction with a running total per customer.

```sql
SELECT 
    customer_id,
    transaction_date,
    amount,
    SUM(amount) OVER (PARTITION BY customer_id ORDER BY transaction_date) as running_total
FROM transactions
ORDER BY customer_id, transaction_date;
```

### Q2: Find duplicate records
Find all orders that have duplicate entries based on order_id.

```sql
SELECT order_id, COUNT(*) as cnt
FROM orders
GROUP BY order_id
HAVING COUNT(*) > 1;

-- To see full duplicate rows:
SELECT *
FROM orders
WHERE order_id IN (
    SELECT order_id FROM orders GROUP BY order_id HAVING COUNT(*) > 1
);
```

### Q3: Rank and get top N per group
Get the top 3 highest-paid employees per department.

```sql
WITH ranked AS (
    SELECT 
        department,
        employee_name,
        salary,
        ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC) as rn
    FROM employees
)
SELECT department, employee_name, salary
FROM ranked
WHERE rn <= 3;
```

### Q4: Gap detection in time series
Find missing dates in a daily data feed (gaps in the sequence).

```sql
WITH date_range AS (
    SELECT DATEADD(day, seq4(), '2024-01-01') as expected_date
    FROM TABLE(GENERATOR(ROWCOUNT => 365))
),
actual_dates AS (
    SELECT DISTINCT DATE(load_date) as actual_date
    FROM daily_feed
    WHERE load_date >= '2024-01-01'
)
SELECT dr.expected_date as missing_date
FROM date_range dr
LEFT JOIN actual_dates ad ON dr.expected_date = ad.actual_date
WHERE ad.actual_date IS NULL
ORDER BY missing_date;
```

### Q5: Year-over-year comparison
Show monthly revenue with YoY growth percentage.

```sql
WITH monthly AS (
    SELECT 
        DATE_TRUNC('month', order_date) as month,
        SUM(revenue) as total_revenue
    FROM orders
    GROUP BY 1
)
SELECT 
    month,
    total_revenue,
    LAG(total_revenue, 12) OVER (ORDER BY month) as same_month_last_year,
    ROUND((total_revenue - LAG(total_revenue, 12) OVER (ORDER BY month)) 
        / NULLIF(LAG(total_revenue, 12) OVER (ORDER BY month), 0) * 100, 2) as yoy_growth_pct
FROM monthly
ORDER BY month;
-- LAG(.., 12) assumes no missing months; for gappy data, self-join on month - 1 year instead
```

### Q6: Sessionization (common in analytics interviews)
Group user clicks into sessions (new session if gap > 30 minutes).

```sql
WITH click_gaps AS (
    SELECT 
        user_id,
        click_time,
        DATEDIFF('minute', 
            LAG(click_time) OVER (PARTITION BY user_id ORDER BY click_time), 
            click_time) as gap_minutes
    FROM clickstream
),
session_starts AS (
    SELECT *,
        CASE WHEN gap_minutes > 30 OR gap_minutes IS NULL THEN 1 ELSE 0 END as is_new_session
    FROM click_gaps
)
SELECT 
    user_id,
    click_time,
    SUM(is_new_session) OVER (PARTITION BY user_id ORDER BY click_time) as session_id
FROM session_starts;
```

### Q7: Slowly Changing Dimension - find current active record
Table has history (start_date, end_date). Find current record per customer.

```sql
SELECT *
FROM customer_dim
WHERE end_date IS NULL OR end_date = '9999-12-31';

-- Or with QUALIFY:
SELECT *
FROM customer_dim
QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY start_date DESC) = 1;
```

### Q8: Recursive CTE - org hierarchy
Find all employees under a given manager (any depth).

```sql
WITH RECURSIVE org_tree AS (
    -- Base: the manager
    SELECT employee_id, employee_name, manager_id, 1 as level
    FROM employees
    WHERE employee_id = 'MGR001'
    
    UNION ALL
    
    -- Recursive: their reports
    SELECT e.employee_id, e.employee_name, e.manager_id, ot.level + 1
    FROM employees e
    JOIN org_tree ot ON e.manager_id = ot.employee_id
)
SELECT * FROM org_tree ORDER BY level, employee_name;
```

---

## Part 2: Python Problems (FDE-style, not LeetCode-hard)

### Q1: Parse a JSON API response and flatten it
```python
import json

data = {
    "users": [
        {"id": 1, "name": "Alice", "orders": [{"id": 101, "amount": 50}, {"id": 102, "amount": 75}]},
        {"id": 2, "name": "Bob", "orders": [{"id": 103, "amount": 30}]}
    ]
}

# Flatten to: user_id, user_name, order_id, amount
rows = []
for user in data["users"]:
    for order in user["orders"]:
        rows.append({
            "user_id": user["id"],
            "user_name": user["name"],
            "order_id": order["id"],
            "amount": order["amount"]
        })

# Result: list of flat dicts ready for pandas/DB insert
print(rows)
```

### Q2: Read a CSV, find anomalies, send alert
```python
import pandas as pd

df = pd.read_csv("daily_metrics.csv")

# Find days where value deviates more than 2 standard deviations
mean = df["metric_value"].mean()
std = df["metric_value"].std()

anomalies = df[abs(df["metric_value"] - mean) > 2 * std]

if not anomalies.empty:
    print(f"Found {len(anomalies)} anomalies:")
    print(anomalies[["date", "metric_value"]])
    # In production: send email/Slack alert
```

### Q3: Connect to Snowflake, run query, return results
```python
import snowflake.connector
import pandas as pd

def query_snowflake(sql, database="MY_DW"):
    # Service users: key-pair (or OAuth) auth; Snowflake is phasing out
    # password-only sign-in. Load the key from a secrets manager, never from code.
    conn = snowflake.connector.connect(
        user="SVC_ACCOUNT",
        account="myorg-myaccount",
        private_key_file="/run/secrets/svc_rsa_key.p8",
        warehouse="ANALYTICS_WH",
        database=database,
    )
    try:
        cur = conn.cursor()
        cur.execute(sql)
        return cur.fetch_pandas_all()   # needs snowflake-connector-python[pandas]
    finally:
        conn.close()

# Usage
result = query_snowflake("SELECT * FROM sales.daily_summary WHERE date = CURRENT_DATE()")
print(f"Rows: {len(result)}")
```

### Q4: Dictionary manipulation - group and aggregate
```python
# Given: list of transactions
transactions = [
    {"customer": "Alice", "amount": 100},
    {"customer": "Bob", "amount": 50},
    {"customer": "Alice", "amount": 75},
    {"customer": "Bob", "amount": 200},
    {"customer": "Alice", "amount": 30},
]

# Task: total per customer
from collections import defaultdict

totals = defaultdict(float)
for t in transactions:
    totals[t["customer"]] += t["amount"]

# Result: {'Alice': 205.0, 'Bob': 250.0}
print(dict(totals))
```

### Q5: Write a simple retry decorator
```python
import time

def retry(max_attempts=3, delay=2):
    def decorator(func):
        def wrapper(*args, **kwargs):
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if attempt == max_attempts - 1:
                        raise
                    print(f"Attempt {attempt+1} failed: {e}. Retrying in {delay}s...")
                    time.sleep(delay)
        return wrapper
    return decorator

@retry(max_attempts=3, delay=5)
def call_api(url):
    # simulates an API call that might fail
    import requests
    response = requests.get(url)
    response.raise_for_status()
    return response.json()
```

### Q6: Compare two datasets and find differences
```python
import pandas as pd

# Two sources of truth
source_a = pd.read_csv("snowflake_export.csv")
source_b = pd.read_csv("oracle_export.csv")

# Find rows in A not in B
merged = source_a.merge(source_b, on="record_id", how="outer", indicator=True, suffixes=("_sf", "_oracle"))

only_in_snowflake = merged[merged["_merge"] == "left_only"]
only_in_oracle = merged[merged["_merge"] == "right_only"]
in_both = merged[merged["_merge"] == "both"]

# Check for value differences in matching rows
mismatches = in_both[in_both["amount_sf"] != in_both["amount_oracle"]]

print(f"Only in Snowflake: {len(only_in_snowflake)}")
print(f"Only in Oracle: {len(only_in_oracle)}")
print(f"Value mismatches: {len(mismatches)}")
```

---

## Part 3: Snowflake Cortex AI - Coding Examples & Use Cases

### Q1: Document classification using Cortex LLM Functions
Use case: Auto-classify incoming support tickets.

```sql
-- Classify support tickets into categories
SELECT 
    ticket_id,
    subject,
    AI_CLASSIFY(
        description,
        ['billing', 'technical', 'account_access', 'feature_request', 'outage']
    ):labels[0]::string as category   -- older code: SNOWFLAKE.CORTEX.CLASSIFY_TEXT
FROM support_tickets
WHERE created_date = CURRENT_DATE();
```

### Q2: Summarize long documents stored in Snowflake
Use case: Generate executive summaries of policy documents.

```sql
-- Summarize policy documents for quick review
SELECT 
    doc_id,
    doc_title,
    LENGTH(full_text) as char_count,
    AI_SUMMARIZE(full_text) as executive_summary   -- older code: SNOWFLAKE.CORTEX.SUMMARIZE
FROM policy_documents
WHERE last_updated > DATEADD(day, -7, CURRENT_DATE());
```

### Q3: Sentiment analysis on customer feedback
Use case: Track customer sentiment from survey responses.

```sql
SELECT 
    response_id,
    feedback_text,
    SNOWFLAKE.CORTEX.SENTIMENT(feedback_text) as sentiment_score,   -- -1..1
    CASE 
        WHEN sentiment_score > 0.3 THEN 'positive'   -- reuse the alias: one LLM call, not three
        WHEN sentiment_score < -0.3 THEN 'negative'
        ELSE 'neutral'
    END as sentiment_label
FROM customer_feedback
WHERE survey_date = CURRENT_DATE();
-- AI_SENTIMENT(text) is the newer function; it returns category labels
-- (positive/negative/neutral/mixed), optionally per aspect, instead of a score.
```

### Q4: Cortex COMPLETE() - custom prompts for data extraction
Use case: Extract structured fields from unstructured text.

```sql
-- Extract key info from contract text
SELECT 
    contract_id,
    AI_COMPLETE(
        model => 'mistral-large2',
        prompt => 'Extract vendor_name, contract_value, start_date, end_date, auto_renewal from this contract: ' || contract_text,
        response_format => {'type': 'json', 'schema': {'type': 'object', 'properties': {
            'vendor_name': {'type': 'string'}, 'contract_value': {'type': 'number'},
            'start_date': {'type': 'string'}, 'end_date': {'type': 'string'},
            'auto_renewal': {'type': 'boolean'}}}}
    ) as extracted_fields   -- structured output: schema-valid JSON, no parsing prose
    -- (AI_EXTRACT is a purpose-built alternative for field extraction)
FROM raw_contracts
WHERE status = 'pending_review';
```

### Q5: Cortex Search - semantic search over enterprise docs
Use case: Find relevant procedures without exact keyword match.

```sql
-- Step 1: Create search service (one-time setup)
CREATE OR REPLACE CORTEX SEARCH SERVICE procedure_search
  ON procedure_text
  ATTRIBUTES doc_title, department, last_updated
  WAREHOUSE = genai_wh
  TARGET_LAG = '1 hour'
  AS (
    SELECT procedure_text, doc_title, department, last_updated
    FROM operating_procedures
    WHERE status = 'active'
  );

-- Step 2: Test with natural language. SEARCH_PREVIEW is a scalar function that
-- returns a JSON string and accepts only literals; apps use the Python/REST API.
SELECT r.value:doc_title::string AS doc_title, r.value:department::string AS department
FROM TABLE(FLATTEN(PARSE_JSON(
    SNOWFLAKE.CORTEX.SEARCH_PREVIEW(
        'procedure_search',
        '{
            "query": "what is the process for reporting a safety hazard",
            "columns": ["doc_title", "procedure_text", "department"],
            "limit": 5
        }'
    )
)['results'])) r;
```

### Q6: Cortex Analyst - semantic model + natural language query
Use case: Business users ask questions without writing SQL.

```yaml
# semantic_model.yaml (legacy YAML on a stage; new builds can use CREATE SEMANTIC VIEW)
name: demand_forecasting
description: "Demand forecast vs actuals"
tables:
  - name: load_forecast
    base_table: {database: ANALYTICS, schema: OPS, table: V_DAILY_FORECAST}
    description: "Daily load forecast vs actuals"
    time_dimensions:
      - name: forecast_date
        expr: FORECAST_DATE
        data_type: DATE
    dimensions:
      - name: hour_ending
        expr: HOUR_ENDING
        description: "Hour of day (1-24)"
    facts:
      - name: forecast_mw
        expr: FORECAST_MW
        synonyms: ["predicted load", "expected demand"]
      - name: actual_mw
        expr: ACTUAL_MW
        synonyms: ["real load", "measured demand"]
    metrics:
      - name: forecast_error
        expr: AVG(ABS(load_forecast.forecast_mw - load_forecast.actual_mw))
        description: "Average absolute forecast error"
      - name: mape
        expr: AVG(ABS(load_forecast.forecast_mw - load_forecast.actual_mw) / NULLIF(load_forecast.actual_mw, 0)) * 100
        description: "Mean absolute percentage error"
```

User asks: "What was the average forecast error last week?"
Cortex Analyst generates and executes the SQL automatically. (Snowflake now recommends
calling it through a Cortex Agent, which can also use Cortex Search.)

### Q7: Full RAG pipeline in pure Snowflake SQL
Use case: Answer questions from internal docs without external services.

!!! warning "This SQL is conceptual"
    `SEARCH_PREVIEW` returns a JSON string and accepts only string literals, so the
    `:user_question` concatenation below won't run as written. It's also an injection
    risk. In practice: call Cortex Search from the Python/REST API with the user's
    question as a parameter, then pass the hits to `AI_COMPLETE` (or let a Cortex Agent
    with a Search tool do both). Use the SQL to explain the flow.

```sql
-- Step 1: Retrieve relevant context using Cortex Search
WITH context AS (
    SELECT doc_text, doc_title
    FROM TABLE(
        SNOWFLAKE.CORTEX.SEARCH_PREVIEW(
            'policy_search',
            '{"query": "' || :user_question || '", "columns": ["doc_text", "doc_title"], "limit": 3}'
        )
    )
),
-- Step 2: Combine context into a single string
combined_context AS (
    SELECT LISTAGG(doc_title || ': ' || doc_text, '\n---\n') as all_context
    FROM context
)
-- Step 3: Generate answer using Cortex COMPLETE
SELECT SNOWFLAKE.CORTEX.COMPLETE(
    'mistral-large',
    'You are a helpful assistant. Answer the question based only on the provided context. ' ||
    'If the answer is not in the context, say "I don''t have information about that."\n\n' ||
    'Context:\n' || all_context || '\n\n' ||
    'Question: ' || :user_question || '\n\nAnswer:'
) as answer
FROM combined_context;
```

### Q8: Cortex for data quality - detect anomalies with LLM
Use case: Use LLM to explain why a data point looks wrong.

```sql
WITH anomalies AS (
    SELECT *
    FROM daily_metrics
    WHERE metric_value > (SELECT AVG(metric_value) + 3 * STDDEV(metric_value) FROM daily_metrics)
)
SELECT 
    metric_date,
    metric_value,
    SNOWFLAKE.CORTEX.COMPLETE(
        'mistral-large',
        'This metric value of ' || metric_value || ' on ' || metric_date || 
        ' is significantly higher than the average of ' || 
        (SELECT ROUND(AVG(metric_value), 2) FROM daily_metrics) ||
        '. The typical range is ' || 
        (SELECT ROUND(AVG(metric_value) - STDDEV(metric_value), 2) FROM daily_metrics) || ' to ' ||
        (SELECT ROUND(AVG(metric_value) + STDDEV(metric_value), 2) FROM daily_metrics) ||
        '. What are 3 possible business reasons for this spike? Be concise.'
    ) as ai_explanation
FROM anomalies;
```

---

## Part 4: System Design Questions

### Q1: Design a real-time RAG system for enterprise documents
Key points to cover:
- Document ingestion pipeline (S3 -> chunking -> embeddings -> vector store)
- Retrieval: hybrid search (BM25 + semantic), reranking
- Generation: LLM with streamed response
- Caching: frequent questions cached, embedding cache
- Monitoring: latency per step, retrieval precision, user feedback loop
- Scale: async processing, queue-based ingestion, read replicas for vector DB

### Q2: Design a streaming data pipeline with CDC from Oracle to Snowflake
Key points:
- Source: Oracle with LogMiner or AWS DMS for CDC
- Transport: Kafka/MSK for durability and replay
- Landing: S3 raw zone (Parquet, partitioned by date)
- Loading: Snowpipe for continuous ingestion into raw tables
- Transform: Streams + Tasks for incremental processing, or Dynamic Tables
- Serving: Materialized views or dynamic tables for dashboards
- Monitoring: row counts at each stage, latency tracking, alerting on gaps

### Q3: Design a multi-tenant AI chatbot platform
Key points:
- Tenant isolation: separate conversation stores per tenant, RBAC on knowledge bases
- Bot routing: tenant config determines which knowledge base, prompt template, and model to use
- Streaming: WebSocket per user session, SNS for async LLM calls
- Guardrails: per-tenant PII rules, content filtering
- Cost tracking: token usage per tenant for billing
- Scale: horizontal Lambda scaling, DynamoDB auto-scaling

### Q4: "Our Snowflake queries are slow" - how do you diagnose and fix?
Approach:
1. Query Profile in Snowflake UI - look for:
   - Spilling to local/remote storage (warehouse too small)
   - Full table scans (missing clustering/pruning)
   - Exploding joins (bad join condition)
2. Check warehouse sizing - right-size for workload
3. Check clustering - are filter columns aligned with micro-partition ordering?
4. Separate workloads - don't run ETL and dashboards on same warehouse
5. Caching - result cache (24h), warehouse cache (local SSD), metadata cache
6. Materialized views or dynamic tables for expensive repeated queries

---

## Part 5: Real Scenario Questions (Customer-facing)

### Q1: Customer has 500TB in Oracle on-prem. They want to move to Snowflake. Walk me through it.
A:
- Discovery: catalog all schemas, tables, views, stored procs, jobs. Identify dependencies.
- Prioritize: move analytics workloads first (most value, least risk). Leave transactional (OLTP) for later.
- Architecture: Raw -> Curated -> Analytics layers in Snowflake. Data Vault for raw, Star schema for serving.
- Migration approach: AWS DMS for bulk + CDC. Snowpipe for streaming feeds. Rewrite stored procs in Snowflake SQL or Snowpark Python.
- Validation: row counts, checksums, business-logic spot checks. Run parallel for 2-4 weeks.
- Cutover: switch read traffic first, then write traffic. Keep Oracle alive for 30-day rollback window.

### Q2: Business user says "I want to ask questions about our data in English." What do you build?
A: Two options depending on their data:

Option A (structured data in Snowflake): Cortex Analyst
- Define a semantic model (YAML) mapping business terms to tables/columns
- User types question -> Cortex Analyst generates SQL -> executes -> returns results
- No Python needed, runs inside Snowflake

Option B (unstructured docs + structured data): RAG + SQL Agent
- Documents: chunk, embed, store in Cortex Search
- Structured data: LangChain SQL Agent with Snowflake connector
- Router decides: is this a doc question or a data question?
- Stream response back to user

### Q3: Your monitoring shows a data pipeline delivered wrong numbers yesterday. What do you do?
A: Based on how I actually handle this:
1. First: how wrong? Check magnitude. Off by 1% vs off by 50% changes urgency.
2. Identify scope: one table or many? One date or a range?
3. Compare sources: run my three-way comparison (Snowflake vs source system). Find where the mismatch starts.
4. Root cause: schema change upstream? Missing records in CDC? Duplicate load? Timezone issue?
5. Fix: reload from source if needed. Update validation rules to catch this pattern going forward.
6. Communicate: email stakeholders with impact assessment and ETA for fix.
7. Prevent: add the specific check to daily monitoring so it alerts next time before anyone notices.


---

## Part 6: GenAI Core Coding Questions (Actually Asked in Interviews)

These are the questions that get people rejected. Know them cold.

### Q1: Count each word in a sentence
```python
def count_words(sentence):
    words = sentence.lower().split()
    word_count = {}
    for word in words:
        word_count[word] = word_count.get(word, 0) + 1
    return word_count

# Test
text = "the cat sat on the mat the cat"
print(count_words(text))
# {'the': 3, 'cat': 2, 'sat': 1, 'on': 1, 'mat': 1}

# One-liner version:
from collections import Counter
print(Counter(text.lower().split()))
```

### Q2: Write a chunking function (chunk_size=10, chunk_overlap=5)
This is the most commonly asked GenAI coding question. They want to see if you understand how text gets split for RAG.

```python
def chunk_text(text, chunk_size=10, chunk_overlap=5):
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - chunk_overlap  # move by (size - overlap)
    return chunks

# Test
text = "abcdefghijklmnopqrstuvwxyz"
result = chunk_text(text, chunk_size=10, chunk_overlap=5)
print(result)
# ['abcdefghij', 'fghijklmno', 'klmnopqrst', 'pqrstuvwxy', 'uvwxyz']

# Explanation:
# Chunk 1: positions 0-9   -> 'abcdefghij'
# Chunk 2: positions 5-14  -> 'fghijklmno'  (overlaps 5 chars with previous)
# Chunk 3: positions 10-19 -> 'klmnopqrst'
# Chunk 4: positions 15-24 -> 'pqrstuvwxy'
# Chunk 5: positions 20-25 -> 'uvwxyz'      (shorter, end of text)
```

### Q3: What is semantic chunking? How is it different from fixed-size chunking?

**Fixed-size chunking:** Split every N characters or N tokens. Blind to content. Might cut mid-sentence.

**Semantic chunking:** Split based on meaning. Keep related sentences together. Break at topic boundaries.

How semantic chunking works:
1. Split text into sentences
2. Compute embedding for each sentence
3. Compare adjacent sentence embeddings (cosine similarity)
4. If similarity between two adjacent sentences drops below a threshold, that's a chunk boundary
5. Group sentences between boundaries into chunks

```python
# Simplified semantic chunking logic
from sentence_transformers import SentenceTransformer
import numpy as np

def semantic_chunk(text, threshold=0.5):
    model = SentenceTransformer('all-MiniLM-L6-v2')
    
    # Split into sentences
    sentences = text.split('. ')
    
    # Get embeddings
    embeddings = model.encode(sentences)
    
    # Find breakpoints (where similarity drops)
    chunks = []
    current_chunk = [sentences[0]]
    
    for i in range(1, len(sentences)):
        # Cosine similarity between adjacent sentences
        sim = np.dot(embeddings[i], embeddings[i-1]) / (
            np.linalg.norm(embeddings[i]) * np.linalg.norm(embeddings[i-1]))
        
        if sim < threshold:
            # Low similarity = topic change = new chunk
            chunks.append('. '.join(current_chunk))
            current_chunk = [sentences[i]]
        else:
            current_chunk.append(sentences[i])
    
    chunks.append('. '.join(current_chunk))  # last chunk
    return chunks
```

### Q4: All types of chunking

| Type | How | When to use |
|------|-----|-------------|
| Fixed-size | Every N chars/tokens with overlap | Simple, fast, good baseline |
| Sentence-based | Split on sentence boundaries | Better than fixed, preserves meaning |
| Paragraph-based | Split on \n\n | Structured documents |
| Semantic | Embedding similarity between segments | Best quality, slower |
| Recursive | Try large chunks first, split smaller if too big | LangChain default, good general purpose |
| Document-structure | Headers, sections, tables as boundaries | Technical docs, manuals |
| Token-based | Split by token count (tiktoken) | When you need exact token budgets |

### Q5: RAG pipeline architecture - what all things are needed?

```
Document Ingestion:
  Raw Docs (PDF/DOCX/HTML) 
    -> Document Loader (PyPDF, Unstructured)
    -> Text Extraction
    -> Chunking (recursive, semantic, or fixed)
    -> Embedding Model (OpenAI, Cohere, all-MiniLM)
    -> Vector Store (Pinecone, FAISS, Cortex Search, Chroma)

Query Pipeline:
  User Question
    -> Query Preprocessing (rewrite, expand, decompose)
    -> Embedding (same model as documents)
    -> Vector Search (top-k similar chunks)
    -> (Optional) Reranking (cross-encoder, Cohere rerank)
    -> Context Assembly (selected chunks + prompt template)
    -> LLM Generation (Claude, GPT, Gemini, Llama, Mistral)
    -> Post-processing (citations, confidence score)
    -> Response to User

Supporting Infrastructure:
  - Metadata store (chunk source, page number, document title)
  - Evaluation framework (RAGAS, human feedback)
  - Caching layer (repeated questions)
  - Guardrails (PII filter, hallucination check)
  - Monitoring (latency, retrieval precision, token cost)
```

### Q6: Types of Vector Databases - differences

| Vector DB | Type | Best for |
|-----------|------|----------|
| Pinecone | Managed cloud service | Production, zero ops, scales automatically |
| FAISS | In-memory library (Meta) | Fast prototyping, single-machine, no server needed |
| Chroma | Open source, lightweight | Local dev, small datasets, easy setup |
| Weaviate | Open source, full-featured | Hybrid search (vector + keyword), self-hosted |
| Milvus | Open source, distributed | Large scale, billion-vector workloads |
| Qdrant | Open source, Rust-based | Fast, filtering support, good API |
| Snowflake Cortex Search | Managed inside Snowflake | When data already lives in Snowflake, no separate infra |
| pgvector | Postgres extension | When you already use Postgres, don't want another DB |

Key differences:
- Managed vs self-hosted (Pinecone = zero ops, FAISS = you manage everything)
- Scale (FAISS = millions, Milvus = billions, Chroma = thousands)
- Hybrid search (Weaviate, Cortex Search support keyword + vector together)
- Filtering (can you filter by metadata before/during vector search?)
- Cost (FAISS/Chroma = free, Pinecone = pay per vector stored + queries)

### Q7: How to reduce hallucinations?

1. **Better retrieval** - if you feed the LLM wrong context, it gives wrong answers. Fix retrieval first.
2. **Smaller context** - don't stuff 20 chunks. Use 3-5 most relevant ones.
3. **Explicit instructions** - "Answer ONLY based on the provided context. If the answer is not in the context, say 'I don't know.'"
4. **Temperature = 0** (where supported) - more repeatable, less creative output; it does not by itself make answers true
5. **Grounding checks** - after generation, verify claims against retrieved docs
6. **Confidence scoring** - if the model isn't sure, flag it for human review
7. **Citation requirement** - force the model to cite which chunk it used for each claim
8. **Fact-checking chain** - generate answer, then run a second LLM call: "Is this answer supported by the context? Yes/No"
9. **Smaller, focused prompts** - one question per call, not "answer these 10 things"

### Q8: How do you validate if Text-to-SQL responses are accurate?

Multiple validation layers:
```python
# 1. SQL syntax validation (does it even parse?)
import sqlparse
parsed = sqlparse.parse(generated_sql)
if not parsed:
    return "Invalid SQL"

# 2. Execute in read-only mode (can it run?)
# Use a read-only role so bad SQL can't break anything
cursor.execute("USE ROLE READ_ONLY")
result = cursor.execute(generated_sql)

# 3. Sanity checks on results
if result.rowcount == 0:
    flag("Empty result - might be wrong table/filter")
if result.rowcount > 1000000:
    flag("Too many rows - probably missing a WHERE clause")

# 4. Compare against known answers (golden dataset)
# Keep a set of question-answer pairs you know are correct
# Periodically test: does the agent get these right?

# 5. Human feedback loop
# Show generated SQL to user, let them approve/reject
# Log rejections to improve prompts

# 6. Column-level validation
# Check: does the generated SQL reference columns that actually exist?
# Check: are aggregations applied to numeric columns only?
```

### Q9: GraphCypherQAChain - what purpose does it solve?
A: It's a LangChain component for question-answering over graph databases (Neo4j).

Flow:
1. User asks a question in English
2. LLM translates the question into a Cypher query (Neo4j's query language)
3. Cypher query executes against Neo4j
4. Results come back
5. LLM formats the results into a human-readable answer

Use cases:
- "Who reported to this manager 2 levels deep?" (org chart)
- "What tables depend on this source column?" (data lineage)
- "Find all customers connected to this fraud case" (fraud detection)
- "What's the shortest path between entity A and entity B?" (relationship analysis)

```python
# Current packages: langchain-neo4j and langchain-aws
from langchain_neo4j import GraphCypherQAChain, Neo4jGraph
from langchain_aws import ChatBedrockConverse

graph = Neo4jGraph(url="bolt://localhost:7687", username="neo4j", password=NEO4J_PASSWORD)
llm = ChatBedrockConverse(model=BEDROCK_MODEL_ID)   # a current Claude model or inference profile

chain = GraphCypherQAChain.from_llm(
    llm=llm, graph=graph, verbose=True,
    allow_dangerous_requests=True,   # required opt-in: the LLM writes Cypher, so use a read-only DB user
)
result = chain.invoke({"query": "Which tables are downstream of the CUSTOMER table?"})
```

### Q10: Components of a Text-to-SQL chatbot

```
1. User Interface
   - Chat input (text box)
   - SQL display (show what was generated)
   - Results table (formatted output)
   - Feedback buttons (correct/incorrect)

2. Query Understanding
   - Intent detection (is this a data question or general chat?)
   - Entity extraction (table names, column names, date ranges mentioned)
   - Ambiguity resolution (what does "revenue" mean in this context?)

3. Schema Context
   - Database schema (tables, columns, types)
   - Business glossary (revenue = sales - refunds)
   - Sample data (so LLM understands the format)
   - Relationships (foreign keys, join paths)

4. SQL Generation
   - LLM (Claude, GPT-4) with schema in context
   - Few-shot examples of question -> SQL pairs
   - Dialect-specific prompting (Snowflake SQL vs Postgres SQL)

5. Validation Layer
   - SQL parser check (syntax valid?)
   - Column existence check (do referenced columns exist?)
   - Read-only execution (can't write/delete)
   - Result sanity check (row count, null checks)

6. Execution Engine
   - Database connector (Snowflake connector, SQLAlchemy)
   - Read-only role/permissions
   - Timeout handling
   - Result size limits

7. Response Formatting
   - Table display for small results
   - Summary for large results ("15,432 rows, showing top 10")
   - Chart suggestion for numeric data

8. Feedback & Learning
   - User thumbs up/down
   - SQL correction tracking
   - Prompt improvement based on failures
```

### Q11: Multi-Agent architecture (not LangChain/LangGraph)
When they ask this, they want to know if you understand agent collaboration patterns beyond using a framework:

**Types of multi-agent patterns:**

1. **Supervisor pattern** - one agent coordinates others
   - Supervisor decides which specialist to call
   - Specialists: SQL agent, doc agent, calculator agent
   - Supervisor assembles final answer

2. **Debate/consensus** - multiple agents answer, then vote
   - 3 agents each generate SQL from the same question
   - Compare outputs, take majority or ask a judge agent to pick best

3. **Pipeline/sequential** - output of one feeds the next
   - Agent 1: understand question and decompose
   - Agent 2: retrieve relevant schema
   - Agent 3: generate SQL
   - Agent 4: validate and fix SQL

4. **Autonomous/swarm** - agents work independently, share a workspace
   - Research agent gathers context
   - Writer agent drafts response
   - Critic agent reviews and suggests edits
   - Writer revises

```python
# Simple multi-agent without LangGraph:
class Supervisor:
    def __init__(self):
        self.agents = {
            "sql": SQLAgent(),
            "docs": DocAgent(),
            "calculator": CalcAgent()
        }
    
    def route(self, question):
        # Classify intent
        intent = classify_question(question)  # LLM call
        
        if intent == "data_query":
            return self.agents["sql"].run(question)
        elif intent == "document_search":
            return self.agents["docs"].run(question)
        elif intent == "calculation":
            return self.agents["calculator"].run(question)
        else:
            return self.agents["docs"].run(question)  # default
```

### Q12: Retrieve chunks from text (coding question)
Given a vector store with chunks, retrieve the most relevant ones for a query.

```python
# Simple retrieval without a vector DB (interview-friendly)
from sentence_transformers import SentenceTransformer
import numpy as np

def retrieve_chunks(query, chunks, top_k=3):
    model = SentenceTransformer('all-MiniLM-L6-v2')
    
    # Embed everything
    query_embedding = model.encode([query])[0]
    chunk_embeddings = model.encode(chunks)
    
    # Cosine similarity
    similarities = []
    for i, chunk_emb in enumerate(chunk_embeddings):
        sim = np.dot(query_embedding, chunk_emb) / (
            np.linalg.norm(query_embedding) * np.linalg.norm(chunk_emb))
        similarities.append((i, sim, chunks[i]))
    
    # Sort by similarity, return top-k
    similarities.sort(key=lambda x: x[1], reverse=True)
    return [(chunk, score) for _, score, chunk in similarities[:top_k]]

# Test
chunks = [
    "The company was founded in 1995 in Portland Oregon.",
    "Revenue increased by 15% in Q4 2024.",
    "The CEO announced a new AI initiative.",
    "Employee count reached 3000 this year.",
    "The Q4 earnings call is scheduled for February."
]

results = retrieve_chunks("What was the revenue growth?", chunks, top_k=2)
for chunk, score in results:
    print(f"{score:.3f}: {chunk}")
# 0.782: Revenue increased by 15% in Q4 2024.
# 0.434: The Q4 earnings call is scheduled for February.
```


---

## Part 7: Tokens - Everything You Need to Know

### What is a token?
A token is the smallest unit an LLM processes. Not a word, not a character - something in between. The model breaks text into tokens using a tokenizer (like BPE - Byte Pair Encoding).

Examples:
- "hello" = 1 token
- "Hello," = 2 tokens ("Hello" + ",")
- "unbelievable" = 3 tokens ("un" + "believ" + "able")
- "Snowflake" = 1-2 tokens depending on model
- Numbers: "2024" = 1 token, "123456789" = multiple tokens
- Code: `def my_function():` = ~4-5 tokens

Rule of thumb: 1 token is roughly 4 characters or 0.75 words in English.

### Where are tokens used?
1. **Input tokens** - your prompt (system message + context + user question) gets tokenized before the model sees it
2. **Output tokens** - the model generates response one token at a time
3. **Embedding tokens** - when you embed text for vector search, it counts tokens too
4. **Context window** - the max tokens (input + output) the model can handle in one call

### Why do tokens matter?

1. **Cost** - you pay per token (both input and output)
   - Output tokens typically cost 4-5x input tokens; reasoning models also bill their
     thinking tokens as output
   - Mid-tier frontier models are roughly a few dollars per million input tokens and
     several times that for output; small models are 10-30x cheaper. Prices change
     often, so check the provider's pricing page rather than memorizing numbers
   - Cached prompt prefixes and batch APIs are billed at a steep discount
   - If your RAG stuffs 10,000 tokens of context per query, that adds up fast

2. **Context window limit** - every model has a max
   - Frontier Claude, GPT and Gemini models: up to ~1M tokens in 2026
   - Many smaller/open models: 128K or less
   - Quality degrades well before the hard limit (context rot)
   - If your prompt exceeds the limit, it gets truncated or errors out

3. **Latency** - more output tokens = slower response
   - Each token takes ~20-50ms to generate
   - 500 output tokens = ~10-25 seconds

4. **Quality** - stuffing too many tokens in context dilutes attention
   - Model pays less attention to middle of long prompts ("lost in the middle" problem)

### How to count tokens
```python
# For OpenAI models
import tiktoken
enc = tiktoken.get_encoding("o200k_base")   # tokenizer used by GPT-4o and later
tokens = enc.encode("Hello, how are you?")
print(len(tokens))

# For Claude: exact counts via the token-counting endpoint
# (client.messages.count_tokens(...)); for a quick estimate use ~4 chars per token
text = "This is my prompt"
approx_tokens = len(text) / 4
print(f"Approximately {approx_tokens} tokens")

# For Snowflake Cortex - use AI_COUNT_TOKENS() to estimate before a big run;
# actual usage appears in the ACCOUNT_USAGE Cortex usage views
```

### Token optimization strategies
- Summarize conversation history instead of passing full chat
- Use shorter system prompts (cut fluff)
- Limit retrieved chunks to top 3-5, not 20
- Use smaller models for simple tasks (classification doesn't need 200K context)
- Cache repeated queries, and use provider prompt caching for stable prefixes
- Set max_tokens on output to prevent runaway responses

---

## Part 8: Consulting-Firm GenAI Interview Questions (Two-Round Format)

### Round 1: Core Tech + Foundations

**Q1: What is serialization in Python?**
A: Converting a Python object (dict, list, class instance) into a format that can be stored or transmitted (bytes, JSON string, file). Deserialization is the reverse.
```python
import json
data = {"name": "Alex", "role": "FDE"}
serialized = json.dumps(data)       # Python dict -> JSON string
deserialized = json.loads(serialized)  # JSON string -> Python dict
```

**Q2: What is a pickle file?**
A: Python's binary serialization format. Saves any Python object to a file - dicts, lists, trained ML models, DataFrames. Faster than JSON but Python-only (not portable). Security risk: never unpickle data from untrusted sources.
```python
import pickle
model = {"weights": [0.1, 0.5, 0.3]}
with open("model.pkl", "wb") as f:
    pickle.dump(model, f)
with open("model.pkl", "rb") as f:
    loaded = pickle.load(f)
```

**Q3: Save data from Python into JSON and CSV**
```python
import json
import csv
import pandas as pd

# JSON
data = [{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]
with open("data.json", "w") as f:
    json.dump(data, f, indent=2)

# CSV - using csv module
with open("data.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["name", "age"])
    writer.writeheader()
    writer.writerows(data)

# CSV - using pandas (simpler)
df = pd.DataFrame(data)
df.to_csv("data.csv", index=False)
```

**Q4: Remove duplicates and count elements without inbuilt methods**
```python
# Remove duplicates without set()
def remove_duplicates(lst):
    result = []
    for item in lst:
        if item not in result:
            result.append(item)
    return result

# Count elements without Counter
def count_elements(lst):
    counts = {}
    for item in lst:
        if item in counts:
            counts[item] += 1
        else:
            counts[item] = 1
    return counts

# Test
nums = [1, 2, 2, 3, 3, 3, 4]
print(remove_duplicates(nums))   # [1, 2, 3, 4]
print(count_elements(nums))      # {1: 1, 2: 2, 3: 3, 4: 1}
```

**Q5: Connect to SQL DB using Python. What library?**
```python
# Snowflake
import snowflake.connector
conn = snowflake.connector.connect(user="user", password="pass", account="acc")

# PostgreSQL
import psycopg2
conn = psycopg2.connect(host="localhost", database="mydb", user="user", password="pass")

# Generic (any DB) - SQLAlchemy
from sqlalchemy import create_engine
engine = create_engine("snowflake://user:pass@account/database")

# SQLite (no server needed)
import sqlite3
conn = sqlite3.connect("local.db")
```

**Q6: Why can't you use SQL DB for semantic search?**
A: SQL databases use exact matching (WHERE name = 'X') or pattern matching (LIKE '%X%'). Semantic search needs to find things by meaning, not exact text. "How do I reset my password" and "forgot login credentials" mean the same thing but share no words. You need vector embeddings + similarity search for that. That's why you need a vector DB or Snowflake Cortex Search.

Exception: PostgreSQL with pgvector extension CAN do vector search. But it's not what traditional SQL was designed for.

**Q7: What is preprocessing of data?**
A: Cleaning and preparing text before it goes into an AI pipeline:
- Lowercasing
- Removing special characters, HTML tags
- Tokenization (splitting into words/subwords)
- Stopword removal (the, is, at - sometimes)
- Stemming/lemmatization (running -> run)
- Handling missing values
- Deduplication
- Encoding (labels to numbers)

For RAG specifically: clean the documents before chunking. Remove headers/footers, page numbers, repeated boilerplate.

**Q8: Why use Regex instead of NLP?**
A: Regex is for pattern extraction when you know the exact format. NLP is for understanding meaning.
- Extract email addresses from text: Regex (pattern is fixed)
- Extract dates in known format (MM/DD/YYYY): Regex
- Understand what a sentence means: NLP
- Classify sentiment: NLP

Use Regex when the pattern is deterministic. Use NLP when meaning matters.

**Q9: What is Top-P (nucleus sampling)?**
A: Controls randomness in LLM output by limiting which tokens the model can pick from.
- Top-P = 0.9 means: only consider tokens whose cumulative probability adds up to 90%. Ignore the unlikely tail.
- Lower Top-P = more focused/deterministic
- Higher Top-P = more diverse/creative

Difference from temperature:
- Temperature: scales all probabilities (makes distribution flatter or spikier)
- Top-P: cuts off the tail (removes low-probability options entirely)

In practice: use temperature=0 for SQL generation, temperature=0.7 + top_p=0.9 for creative writing.

**Q10: What is an embedding? Dimensions of OpenAI embeddings?**
A: A vector (list of numbers) that represents the meaning of text. Similar meaning = similar vectors.

Dimensions:
- text-embedding-3-small: 1536 dimensions
- text-embedding-3-large: 3072 dimensions
- text-embedding-ada-002 (legacy): 1536 dimensions
- all-MiniLM-L6-v2 (open source): 384 dimensions
- Cohere embed-v3: 1024 dimensions

More dimensions = captures more nuance but costs more storage and compute. The
text-embedding-3 models (and many newer ones) support shortened vectors (the
`dimensions` parameter / Matryoshka embeddings), so you can trade a little quality for
much smaller indexes.

**Q11: text-embedding-3-small vs text-embedding-3-large?**

| | text-embedding-3-small | text-embedding-3-large |
|---|---|---|
| Dimensions | 1536 | 3072 |
| Quality | Good for most use cases | Better for fine-grained similarity |
| Cost | ~6.5x cheaper ($0.02 vs $0.13 per 1M tokens at launch) | Higher cost |
| Speed | Faster | Slower |
| Storage | Less vector DB space | More space needed |

Use small for: general purpose RAG, chatbot retrieval, search.
Use large for: when retrieval precision really matters (legal, medical), when you have budget.

**Q12: Why do you need a Vector DB?**
A: Regular databases can't efficiently search by similarity across millions of high-dimensional vectors. Vector DBs use specialized indexes (HNSW, IVF) for approximate nearest neighbor search in milliseconds. Without one, a brute-force cosine similarity search over 1M vectors takes seconds - too slow for real-time.

**Q13: Why are chunking and embeddings required?**
A: 
- Chunking: LLMs have context limits. A 100-page PDF can't fit in one prompt. You split it into digestible pieces.
- Embeddings: you need a way to FIND which chunks are relevant to the user's question. Embeddings let you do semantic search - match by meaning, not keywords.

Without chunking: can't fit documents in context.
Without embeddings: can't find the right chunks to include.

**Q14: Why similarity search? Is it always accurate?**
A: Similarity search finds the "closest" vectors to your query. It's NOT always accurate:
- Fails on negations ("companies that DON'T use Snowflake" might return companies that DO use Snowflake)
- Fails on very specific factual queries ("what was revenue on March 15th" - needs exact lookup, not similarity)
- Fails when chunks are too generic (everything scores similarly)

That's why production RAG uses: hybrid search (BM25 keyword + vector), reranking, metadata filters, and sometimes falls back to structured SQL queries for specific facts.

---

### Round 2: GenAI, RAG & System Design

**Q1: Complete RAG architecture**
A: (Covered in Part 6, Q5 above - same answer)

**Q2: Explain CRAG (Corrective RAG)**
A: Normal RAG retrieves and generates. CRAG adds a correction step:
1. Retrieve chunks
2. **Grade the chunks** - are they actually relevant? (LLM or classifier checks)
3. If chunks are relevant -> generate answer normally
4. If chunks are NOT relevant -> try a different retrieval strategy (web search, different query, different index)
5. If chunks are AMBIGUOUS -> combine retrieved + web results

It's self-correcting. Instead of blindly generating from bad context, it checks first and pivots if needed.

**Q3: Reduce hallucinations in RAG**
A: (Covered in Part 6, Q7 above)

**Q4: How do you apply guardrails in AI systems?**
A: Multiple layers:
- **Input guardrails**: check user prompt before it reaches the LLM (PII detection, malicious intent, topic filtering)
- **Output guardrails**: check LLM response before showing to user (factuality check, toxicity filter, format validation)
- **Structural guardrails**: max token limits, rate limiting, cost caps per user/team
- **Content guardrails**: block certain topics entirely, restrict to domain-specific answers only

Tools: Guardrails AI library, NeMo Guardrails (NVIDIA), custom regex/classifier checks, Bedrock Guardrails (AWS managed).

**Q5: Why Agentic AI instead of just Python scripts?**
A: Python scripts follow fixed logic. Agents decide what to do based on the situation:
- Script: "always run query A, then query B, then format output"
- Agent: "understand the question, decide if you need a DB query OR a doc search OR a calculation, pick the right tool, check the result, retry if wrong"

Use agents when: the workflow isn't predictable, when the tool to use depends on the input, when you need multi-step reasoning with decision points.

Use scripts when: the workflow is fixed, same steps every time, no ambiguity.

**Q6: Is RAG dead?**
A: No. People say this because:
- Long context windows (now up to ~1M tokens) mean you can stuff more docs directly
- Fine-tuning means the model "knows" your data

But RAG is still needed because:
- You can't fine-tune on data that changes daily (policies, prices, inventory)
- Even 1M tokens can't hold your entire knowledge base, and quality and cost suffer long before that
- RAG gives source citations (fine-tuned models can't)
- RAG is cheaper than fine-tuning for most use cases
- You can update the knowledge base without retraining

RAG isn't dead - it's evolving (agentic RAG, where the agent searches just in time with tools; graph RAG; CRAG).

**Q7: What is Graph RAG and Graph AI?**
A: Normal RAG: chunks are independent pieces of text. No relationships between them.
Graph RAG: chunks are connected in a knowledge graph. Relationships between entities are preserved.

Example: "Alice manages Bob" and "Bob works on Project X" - in normal RAG these are two separate chunks. In Graph RAG, you can ask "Who manages someone on Project X?" because the graph connects Alice -> Bob -> Project X.

Graph AI broader: using graph structures (Neo4j, NetworkX) for entity resolution, fraud detection, recommendation systems, impact analysis.

**Q8: Difference between GenAI and Agentic AI?**

| | GenAI | Agentic AI |
|---|---|---|
| What it does | Generates content (text, code, images) | Plans, reasons, takes actions, uses tools |
| Input/Output | Prompt in, text out | Goal in, actions + results out |
| Memory | Stateless (per call) | Maintains state across steps |
| Tools | None (just generates) | Can call APIs, DBs, search, calculators |
| Example | "Summarize this doc" | "Research this topic, query the DB, write a report, email it" |

Agentic AI USES GenAI (the LLM) as its brain, but adds planning, tool use, and iteration.

**Q9: How do you get data from DB using agents?**
A: SQL Agent pattern:
1. Agent receives user question
2. Agent gets schema context (tables, columns, types)
3. Agent uses LLM to generate SQL
4. Agent executes SQL against the database (tool call)
5. Agent checks results - if error, it reads the error and fixes the SQL
6. Agent formats results and returns to user

```python
# LangChain 1.x style: SQL tools + create_agent (create_sql_agent / agent.run are legacy)
from langchain.agents import create_agent
from langchain_community.agent_toolkits import SQLDatabaseToolkit

toolkit = SQLDatabaseToolkit(db=snowflake_db, llm=llm)   # db connected with a READ-ONLY role
agent = create_agent(
    model=llm,
    tools=toolkit.get_tools(),
    system_prompt="You write Snowflake SQL. SELECT only. Check the schema before querying.",
)
result = agent.invoke({"messages": [{"role": "user", "content": "What were total sales last month?"}]})
```

The agent decides: which table to look at, what SQL to write, and how to handle errors. You don't hard-code the query.
