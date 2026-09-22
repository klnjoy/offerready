---
icon: material/robot-happy
---

# GenAI Interview Questions & Answers

---

## Section 1: Multi-Bot Platform Architecture Q&A

### Q1: Explain the architecture of the GenAI bot you built?
A: Full-stack conversational AI on AWS. Frontend is React/TypeScript (Vite + Tailwind). Backend is FastAPI in Docker on Lambda behind API Gateway. Real-time streaming via WebSocket API Gateway. LLM is Amazon Bedrock Claude 3.5 Sonnet. Conversations in DynamoDB, documents in S3, auth via Cognito. Infrastructure managed with AWS CDK (TypeScript).

### Q2: How does the user message flow from frontend to LLM and back?
A: User sends message via WebSocket -> API Gateway WebSocket endpoint -> Publisher Lambda stores connection ID -> Backend Lambda picks up message -> Calls Bedrock invoke_model with prompt (including conversation history) -> Streams response chunk-by-chunk via WebSocket post_to_connection -> Frontend renders tokens in real-time.

### Q3: Which LLM model are you using and why?
A: Claude 3.5 Sonnet (anthropic.claude-3-5-sonnet-20240620-v1:0) via Amazon Bedrock. Chosen for strong reasoning, fast response, large context window. Accessed through VPC endpoint for security - no public internet traffic.

### Q4: How do you handle multiple bot types in a single platform?
A: Bot template system. Each bot has custom instructions, knowledge sources, and configs in DynamoDB. The platform supports several bot types - policy Q&A, IT helpdesk, SQL agent, field-crew dispatch, document processing, and campaign assistance - all routed through the same backend with different prompt templates.

### Q5: How do you implement RAG?
A: Users upload documents (PDF, DOCX, XLSX, images) to S3 via presigned URLs. Textract extracts content. Content indexed and retrieved at query time, injected into prompt context before sending to Bedrock. Can also integrate with a document store (e.g. SharePoint) for enterprise document retrieval.

### Q6: How do you handle prompt safety/guardrails?
A: guardrail_check endpoint runs before processing. Classifies input as safe or "Guardrail-Restricted" using malicious_prompt_check module. data_guardrail function checks for sensitive/restricted content before LLM processing.

### Q7: How do you manage conversation history?
A: DynamoDB with PK=user_id, SK=conversation_id. MessageMap (JSON) stores full message tree with parent-child relationships for branching conversations. Tracks metadata: create_time, model, bot_id.

### Q8: How does the SQL Agent work?
A: sql_agent.py connects to Snowflake via snowflake_connector.py. User asks data question -> LLM generates SQL -> Execute against Snowflake -> Return formatted results. Uses LangChain for prompt chaining.

### Q9: How do you handle real-time streaming?
A: AWS API Gateway WebSocket APIs. Connection_id stored in DynamoDB on connect. During inference, Bedrock streaming invoke posts each chunk via apigatewaymanagementapi.post_to_connection(). Frontend renders tokens as they arrive.

### Q10: How is authentication handled?
A: AWS Cognito for user auth. Frontend gets JWT after login. Every request includes Bearer token. Backend middleware verifies JWT using Cognito JWKS, extracts user_id/username, attaches to request state.

### Q11: How do you deploy?
A: Jenkins pipeline builds Docker images, pushes to ECR, deploys via AWS CDK. Separate environments (sand/dev/test/prod) with environment-specific configs. CDK provisions Lambda, API Gateway, DynamoDB, S3, Cognito, VPC, IAM roles.

### Q12: Challenge you faced and how you solved it?
A: Lambda 29-second API Gateway timeout for long LLM responses. Solved by WebSocket streaming - Lambda streams tokens as generated, user sees response immediately. Also VPC networking - set up VPC endpoints for Bedrock and DynamoDB to keep traffic private.

### Q13: How do you handle file uploads?
A: Presigned S3 URLs (PUT) for frontend direct upload - avoids large files through Lambda. Support PDF, DOCX, XLSX, images, audio (WAV/MP3). Textract for document extraction. Checksum check avoids reprocessing duplicates.

### Q14: Difference between procurement batch bot and this bot?
A: The procurement bot is a batch pipeline - EventBridge nightly trigger, bulk purchase-order processing with an LLM for compliance, no user interaction. The conversational platform is real-time - users chat, upload docs, get streaming responses. Same Bedrock infra, different use cases.

### Q15: How do you monitor the system?
A: CloudWatch for Lambda logs/metrics. Track conversation metrics, keyword trends, user feedback (thumbs up/down in DynamoDB). Consent tracking, admin toggles to enable/disable features per application.

---

## Section 2: Python & GenAI Fundamentals Q&A

### 1. List Vs Tuple
- List: Mutable, uses [], slower, more memory, supports append/remove
- Tuple: Immutable, uses (), faster, less memory, hashable (can be dict keys)
- Use tuple when data shouldn't change (coordinates, DB records)

### 2. Append Vs Extend
- append(): Adds single element to end. list.append([1,2]) -> [... , [1,2]]
- extend(): Adds each element individually. list.extend([1,2]) -> [... , 1, 2]

### 3. LangChain Vs LLM
- LLM: The AI model itself (Claude, GPT) that generates text
- LangChain: Framework/orchestration layer that chains LLM calls with tools, memory, retrieval, agents. LLM is the engine, LangChain is the car.

### 4. Sort Vs Sorted
- sort(): In-place, modifies original list, returns None. Only works on lists.
- sorted(): Returns new sorted list, original unchanged. Works on any iterable.

### 5. Reading Files using Python
```python
# Text
with open('file.txt', 'r') as f: content = f.read()
# CSV
import pandas as pd; df = pd.read_csv('file.csv')
# JSON
import json; data = json.load(open('file.json'))
# Excel
df = pd.read_excel('file.xlsx')
# PDF
from PyPDF2 import PdfReader; reader = PdfReader('file.pdf')
# Binary
with open('file.bin', 'rb') as f: data = f.read()
```

### 6. Lambda Function Vs List Comprehension
- Lambda: Anonymous single-expression function. `square = lambda x: x**2`
- List Comprehension: Creates list from iterable. `[x**2 for x in range(10)]`
- Comprehension is more Pythonic and faster for creating lists. Lambda is for passing functions as arguments (map, filter, sort key).

### 7. Types of RAG
- Naive RAG: Simple retrieve + generate
- Advanced RAG: Pre-retrieval (query rewriting), retrieval (hybrid search), post-retrieval (reranking)
- Modular RAG: Pluggable components - routing, query transformation, self-reflection
- Graph RAG: Uses knowledge graphs for structured retrieval
- Agentic RAG: Agent decides when/how to retrieve, can do multi-step retrieval

### 8. Creating Pinecone Index
```python
import pinecone
pinecone.init(api_key="key", environment="env")
pinecone.create_index("my-index", dimension=1536, metric="cosine")
index = pinecone.Index("my-index")
index.upsert(vectors=[("id1", [0.1, 0.2, ...], {"metadata": "value"})])
results = index.query(vector=[0.1, 0.2, ...], top_k=5)
```

### 9. Types of Pinecone Metrics
- Cosine: Measures angle between vectors (most common for text embeddings)
- Euclidean (L2): Measures straight-line distance
- Dotproduct: Measures magnitude + direction (use when vectors are normalized)

---

## Section 3: Text-to-SQL & RAG Client Evaluation Q&A

### 1. How did English queries get translated to SQL?
A: We used Claude 3.5 Sonnet via Bedrock. The LLM receives the user question along with the database schema (table names, column names, data types) in the prompt context. It generates SQL based on few-shot examples in the prompt template. No fine-tuning needed - it's prompt engineering with schema context. We validate the generated SQL before execution.

### 2. APIs interacting with Databases - configuration?
A: FastAPI endpoints connect to Snowflake using the snowflake-connector-python library. Connection config (account, user, role, warehouse) stored in AWS SSM Parameter Store. API receives user question -> generates SQL via LLM -> executes via Snowflake connector -> returns formatted results. All within VPC for security.

### 3. Latency and sync/async responses?
A: Typical response time 3-8 seconds (LLM generation + SQL execution). Responses are async via WebSocket streaming - user sees tokens arriving in real-time. For SQL queries specifically, we wait for full SQL generation, execute it, then stream the formatted answer back. Not blocking the UI.

### 4. LLM Optimization
A: 
- Temperature 0.0 for deterministic SQL generation
- Prompt caching for repeated schema context
- Chunking large datasets (20 rows per LLM call)
- Parallel processing with ThreadPoolExecutor (40 workers)
- VPC endpoints to reduce network latency
- Response streaming to improve perceived latency

### 5. Graph DB - how was it built?
A: Knowledge graph stores entities (tables, columns, relationships) as nodes and edges. Built by parsing database metadata + business glossary. Used for query understanding - when user asks about "revenue", the graph maps it to the correct table/column. Helps with disambiguation and complex multi-table joins.

### 6. NLP for English to SQL - implementation and latencies?
A: LangChain + Bedrock Claude. Prompt includes: schema description, few-shot examples, business rules. Average latency: LLM SQL generation ~2-3s, query execution ~1-2s, response formatting ~1s. Total ~5-6s. For complex joins, up to 8-10s.

### 7. What is Reflection?
A: In AI/LLM context - the model evaluates its own output and iterates. Example: Generate SQL -> Check if valid -> If error, reflect on the error and regenerate. Improves accuracy. In LangGraph, reflection is a node that re-evaluates agent output before returning to user.

### 8. What are Logs in RAG?
A: Tracking the RAG pipeline: query logged, retrieved chunks logged (with relevance scores), prompt sent to LLM logged, response logged. Used for debugging (why did it give wrong answer?), evaluation (retrieval precision), cost tracking (token usage), and compliance auditing.

### 9. How to make AI Model cost effective in production?
A: 
- Use smaller models for simple tasks (Claude Instant for classification, Sonnet for complex)
- Caching: Store frequent Q&A pairs, avoid repeated LLM calls
- Batching: Process multiple requests together
- Prompt optimization: Shorter prompts = fewer tokens = less cost
- Guardrails: Block unnecessary LLM calls early
- Auto-scaling: Scale down during off-hours
- Monitoring: Track cost per query, identify expensive patterns

---

## Section 4: OOP, Python & Frameworks Q&A

### 1. Object Oriented Programming in Generative AI
A: OOP is used to structure GenAI applications. For example:
- Classes for each component: CommonHelper, S3Helper, CustomModel
- Encapsulation: LLM config, credentials, state managed within class
- Inheritance: Base bot class, specialized bots extend it
- Polymorphism: Different bot types (PolicyQnA, SQLAgent) implement same interface
- Design patterns: Factory for creating different LLM chains, Strategy for different retrieval methods

### 2. List Flattening [1,2,[3,4,["r","y"]]]
```python
def flatten(lst):
    result = []
    for item in lst:
        if isinstance(item, list):
            result.extend(flatten(item))
        else:
            result.append(item)
    return result

# Output: [1, 2, 3, 4, "r", "y"]
```

### 3. Decorators in Python and time tracking code
```python
import time
import functools

def timer(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start = time.time()
        result = func(*args, **kwargs)
        end = time.time()
        print(f"{func.__name__} took {end - start:.2f} seconds")
        return result
    return wrapper

@timer
def my_function():
    time.sleep(2)
    return "done"
```

### 4. List comprehension odd/even
```python
numbers = [1, 2, 3, 4, 5, 6]
result = ["odd" if x % 2 != 0 else "even" for x in numbers]
# ["odd", "even", "odd", "even", "odd", "even"]
```

### 5. What is LCEL?
A: LangChain Expression Language. A declarative way to compose LangChain components using the pipe operator (|). Instead of chaining functions manually, you write:
```python
chain = prompt | llm | output_parser
result = chain.invoke({"question": "..."})
```
Benefits: Streaming support built-in, async support, parallel execution, retries, fallbacks - all automatic.

### 6. LangGraph Vs LangChain
- LangChain: Linear chains of LLM calls. Good for simple prompt -> response flows.
- LangGraph: Adds cycles, conditional branching, state management. Good for agents that need to loop, reflect, make decisions. Built on top of LangChain.
- Use LangChain for straightforward RAG/QA. Use LangGraph for multi-step agents with decision logic.

### 7. Tell us about your latest project
A: Built a multi-bot GenAI platform for an energy utility. Conversational platform on AWS - FastAPI backend, React frontend, Bedrock Claude 3.5 Sonnet. Supports 8+ bot types: policy Q&A, SQL agent for Snowflake, document analysis, IT helpdesk, field-crew dispatch. Real-time WebSocket streaming. Also built an automated purchase-order audit system that uses an LLM to check procurement compliance against policies - processes hundreds of POs nightly.

### 8. FastAPI vs RestAPI
- RestAPI: Architectural style/pattern for building APIs using HTTP methods
- FastAPI: Python framework that implements REST APIs with added features:
  - Automatic OpenAPI/Swagger docs
  - Type validation via Pydantic
  - Async support (ASGI)
  - 10x faster than Flask
  - Auto request/response serialization
  - Dependency injection

### 9. What kind of validations for RestAPI?
A: 
- Request body: Pydantic models (type checking, required fields, default values)
- Path parameters: Type annotations (str, int, UUID)
- Query parameters: Optional, default values, enums
- Headers: Authorization Bearer token validation (JWT)
- File uploads: Content-type validation, file extension checks, size limits
- Business logic: Custom validators (e.g., date ranges, valid PO numbers)
- In our code: HTTPBearer for auth, RequestValidationError handler, custom error handlers for 400/403/404/500

---

## Section 5: Observability & Evals Q&A

### Q: We're already building with LangChain and LangGraph. How are you handling observability and evals on top of those builds?

**A: We handle it at three levels:**

**1. Observability (runtime monitoring - from the platform):**
- Python logging on every module (DEBUG level) - logs full request payloads, LLM responses, errors with tracebacks
- DynamoDB conversation tracking - every message stored with lastModifiedDatetimeEpoch, connection_id, model used, bot_id
- Custom metrics endpoint (POST /post_metric) captures user interaction data
- Keyword trends Lambda (GET /get_keywords_trends/{days}) analyzes what users ask over time
- WebSocket connection tracking - connection_id in DynamoDB for active session monitoring
- Guardrail logging - POST /guardrail_check classifies every prompt, results logged
- CloudWatch for Lambda invocation metrics, duration, errors

**2. Evals (quality assessment):**
- User feedback endpoint (POST /feedback) - thumbs up/down per message stored with conversation context
- For procurement audit bot: structured 9-point checklist where each LLM output is Pass/Fail/NA with reason
- Human reviewers accept/reject AI findings from UI (human_review_accept_count, human_review_reject_count)
- Batch runs tagged with Batch_Run_ID to compare accuracy across runs
- Admin toggles to enable/disable features per application without redeployment

**3. Guardrails and safety:**
- Pre-inference guardrail check classifies inputs before reaching LLM
- Restricted prompts logged and counted
- Consent tracking system (GET /get_consent, POST /post_consent)

**What we'd improve next:**
- LangSmith for trace-level observability (each chain step, retrieval scores, token usage per step)
- Automated eval datasets - currently relying on human feedback, would add RAGAS for retrieval quality
- Cost attribution per bot/per user
- A/B testing between model versions

**Honest gap:** We have application-level observability (logs, metrics, feedback) but not yet LLM-specific tracing like LangSmith/LangFuse. That's on the roadmap.


---

## Section 6: AI Fundamentals Interview Guide

### 1. LLM (Large Language Models)

Q1. What is a Large Language Model?
A: AI system trained on massive text datasets to understand, generate, and manipulate human language.

Q2. How are LLMs trained?
A: Pretraining on large text corpora (self-supervised) + Fine-tuning on specific tasks or instructions.

Q3. What is prompt engineering?
A: Designing effective inputs to get accurate and useful outputs from LLMs.

Q4. Few-shot vs zero-shot prompting?
A: Zero-shot = no examples. Few-shot = a few examples to guide the model.

Q5. What is temperature?
A: Controls randomness. Low (0.0) = deterministic. High (0.7+) = creative.

Q6. What is hallucination?
A: Model generates incorrect or fabricated information confidently.

Q7. What is instruction tuning?
A: Fine-tuning on instruction datasets so model follows human commands better.

Q8. What is RLHF?
A: Reinforcement Learning with Human Feedback. Generate responses -> Humans rank -> Train reward model -> Optimize LLM.

Q9. Context windows?
A: Max tokens LLM can process. Claude 3.5 Sonnet = 200K. GPT-4 = 128K.

Q10. What are embeddings?
A: Vector representations of text. Similar meaning = close vectors in space.

### 2. RAG (Retrieval-Augmented Generation)

Q1. What is RAG?
A: Combines retrieval of external data with LLM generation for accuracy and freshness.

Q2. What problem does RAG solve?
A: Reduces hallucinations, enables access to external/private knowledge.

Q3. Embeddings in RAG?
A: Convert text to vectors for similarity search. Same model for docs and queries.

Q4. What is a vector database?
A: DB for storing and searching embeddings using approximate nearest neighbor.

Q5. Popular vector DBs?
A: Pinecone, FAISS, Weaviate, Chroma, Snowflake Cortex Search.

Q6. What is chunking?
A: Splitting docs into smaller pieces. Too large = diluted. Too small = no context. Use overlap.

Q7. Semantic search?
A: Search by meaning (vector similarity) not exact keywords.

Q8. RAG retrieval flow?
A: Query -> Embed -> Search vector DB -> Retrieve docs -> Pass to LLM -> Generate.

Q9. Improve RAG accuracy?
A: Better chunking, hybrid search (BM25 + semantic), reranking, query rewriting, metadata filters.

### 3. System Design & Production AI

Q1. Scalable AI system?
A: Microservices, load balancing, caching, async queues (SQS), autoscaling.

Q2. Deploy ML models?
A: Docker on Lambda/ECS, behind API Gateway, CI/CD via Jenkins, blue-green deployments.

Q3. Model monitoring?
A: Track performance, latency, errors, token usage, cost, user feedback.

Q4. Model drift vs data drift?
A: Data drift = input distribution changes. Model drift = performance degrades. Monitor and retrain.

Q5. Large-scale inference?
A: Batching, caching, quantization, parallel processing, autoscaling, smaller models for simple tasks.

Q6. Model versioning?
A: Model registry (MLflow, SageMaker) for tracking, rollback, experimentation.

Q7. A/B testing?
A: Route traffic splits between model versions, compare real-world performance.

Q8. Optimize latency?
A: Smaller models, caching, streaming, VPC endpoints, parallel processing.

Q9. Real-time AI service?
A: WebSocket streaming, Lambda inference, DynamoDB state, Bedrock streaming invoke.

Q10. Reliability?
A: Monitoring, alerting, retries with backoff, circuit breaker, fallback responses, health checks.

### 4. ML & Deep Learning Fundamentals

Q1. Supervised vs unsupervised vs reinforcement?
A: Supervised = labeled data. Unsupervised = find patterns. Reinforcement = learn via rewards.

Q2. Overfitting vs underfitting?
A: Overfit = memorizes data. Underfit = can't learn. Fix: regularization, more data, model complexity.

Q3. Bias-variance tradeoff?
A: Bias = too simple. Variance = too sensitive. Balance both for good generalization.

Q4. Train/val/test split?
A: Train 70-80%, Validation 10-15% (tuning), Test 10-15% (final eval).

Q5. Gradient descent?
A: Optimization to minimize loss. Variants: SGD, Mini-batch, Adam (most popular).

Q6. Backpropagation?
A: Calculates gradients backward through network using chain rule to update weights.


---

## Section 6b: AI Fundamentals — Interview Depth

The one-liners above are for fast recall. Interviews reward the next layer:
**why, the trade-off, how you'd prove it, and what breaks.** Below are the
highest-leverage fundamentals rewritten to that bar — the difference between a
correct answer and a senior one.

??? question "RAG vs fine-tuning — which, and why? (the classic trap)"
    **Short answer:** RAG for *knowledge that changes or must be cited*;
    fine-tuning for *behavior/format/style* the model should always exhibit.

    **Why:** RAG injects fresh, attributable facts at query time — you can update
    the corpus without retraining, and you get citations. Fine-tuning bakes
    patterns into weights (tone, structure, domain phrasing) but does **not**
    reliably teach new facts and can't cite sources.

    **Trade-offs:** RAG adds retrieval latency + a store to maintain, and quality
    is capped by retrieval quality. Fine-tuning adds a training/eval pipeline,
    risks catastrophic forgetting, and goes stale the moment facts change.

    **How you'd prove the choice:** if the failure is "wrong/outdated facts" →
    measure retrieval recall and groundedness (RAG wins). If the failure is
    "right facts, wrong format/behavior" → RAG won't fix it; a few-shot prompt or
    light fine-tune will.

    **Senior tell:** "Try prompt-engineering first, then RAG, then fine-tune —
    in that order of cost. Most 'we need fine-tuning' asks are actually retrieval
    or prompt problems." Often you use **both**: fine-tune for format, RAG for facts.

??? question "Temperature — beyond 'controls randomness'"
    It scales the logits before sampling: low sharpens toward the top token
    (near-deterministic), high flattens the distribution (more diverse, more
    error-prone). **Trade-off:** 0 for extraction/SQL/classification where you
    want repeatability and testability; 0.5–0.8 for drafting/brainstorm.
    **Failure mode people miss:** temperature 0 is *not* guaranteed identical
    across runs (batching/hardware nondeterminism), so don't rely on it for
    exact-match caching. Pair with top-p; tuning both at once is usually a smell.

??? question "Hallucination — why it happens and how you actually reduce it"
    An LLM predicts likely tokens; it has no notion of truth, so a fluent wrong
    answer is as natural as a right one. **You reduce, not eliminate:** ground it
    with RAG and *require* citations; lower temperature; constrain with structured
    output; add a verification step (self-check or a second model); and gate the
    answer if retrieval confidence is low ("I don't have that"). **How you'd
    prove it improved:** a groundedness/faithfulness metric (LLM-as-judge +
    human spot-check) on a fixed eval set, tracked over releases — not vibes.

??? question "Chunking — the decision that quietly makes or breaks RAG"
    Too large: retrieval pulls irrelevant text, dilutes the prompt, wastes tokens.
    Too small: a chunk loses the context needed to be meaningful. **Trade-off** is
    recall vs precision of the retrieved context. Start ~200–500 tokens with
    overlap so ideas that straddle a boundary survive; prefer **semantic/structural**
    splits (by heading/paragraph) over blind fixed-size cuts. **Prove it:** build a
    small labeled set (query → which chunk should answer it) and measure recall@k
    as you vary chunk size — don't guess.

??? question "Improve RAG accuracy — the ordered lever list (not a grab-bag)"
    Interviewers want *order of operations*, cheapest first:
    1. **Fix chunking** (biggest, cheapest win).
    2. **Hybrid retrieval** (BM25 + vector) so exact terms aren't lost.
    3. **Rerank** the top candidates with a cross-encoder.
    4. **Query rewriting / expansion** for vague questions.
    5. **Metadata filters** to shrink the search space.
    6. Only then consider a better embedding model or fine-tuning.
    Each step: measure recall@k / groundedness before and after — if a lever
    doesn't move the metric, drop it. (See the interactive
    [Keep Asking Why → RAG](Interview_Why_Interactive.md) drill.)

??? question "Reliability of an LLM service — what 'production-ready' means"
    Beyond "add retries": **timeouts** on every model/tool call; **retry with
    backoff** for transient errors only (not for a bad prompt); a **circuit
    breaker** so a slow provider doesn't cascade; a **fallback** (smaller model or
    cached/graceful answer); **idempotency keys** so client retries don't
    double-charge; and **concurrency caps** so a spike can't exhaust tokens/budget.
    **Prove it:** load-test to find the real p95 bottleneck and chaos-test a
    provider slowdown — don't promise SLOs you haven't measured.

??? question "Model vs data drift — and what you actually do about it"
    **Data drift:** the input distribution shifts (new topics, new phrasing).
    **Model/concept drift:** the same inputs now need different outputs, so quality
    decays. **Detection:** monitor input embeddings/feature distributions for
    drift, and track output quality via an eval set + user feedback (thumbs, edit
    rate). **Response:** refresh the RAG corpus (often fixes "drift" without any
    retraining), update prompts/few-shots, and retrain/fine-tune only if the task
    itself changed. **Senior tell:** most "model drift" in LLM apps is stale
    retrieval, not stale weights.

---

## Section 7: Snowflake Cortex AI — Interview Q&A

### Q1: What is Snowflake Cortex and how does it differ from using external LLMs?
A: Cortex is Snowflake's built-in AI layer. The key difference: your data never leaves Snowflake. No copying to S3, no external API calls to OpenAI or Bedrock. The LLM runs inside Snowflake's infrastructure, governed by your existing RBAC and data policies. Three main pieces: Cortex LLM Functions (text generation, summarization, classification), Cortex Search (semantic search without managing embeddings yourself), and Cortex Analyst (natural-language to analytics on structured data).

### Q2: How do Cortex LLM Functions work? Give a real example.
A: SQL functions you call directly on your data. For example:
```sql
SELECT 
  document_id,
  SNOWFLAKE.CORTEX.SUMMARIZE(document_text) as summary,
  SNOWFLAKE.CORTEX.CLASSIFY_TEXT(document_text, 
    ['policy', 'procedure', 'guideline', 'regulation']) as doc_type
FROM enterprise_documents
WHERE upload_date = CURRENT_DATE();
```
No Python, no Lambda, no external services. Runs where the data lives. A common use is to auto-classify incoming policy documents and generate summaries for an operations team.

### Q3: What is Cortex Search and when would you use it over traditional search?
A: Cortex Search gives you semantic search over unstructured text stored in Snowflake. You define a search service on a table/column, Snowflake handles the embeddings and indexing. You query it with natural language and get relevant results ranked by semantic similarity.

Use it when: your users don't know exact keywords, when meaning matters more than exact match, when you want RAG-like retrieval but don't want to manage Pinecone/FAISS/embedding pipelines separately.

You can replace an external search service (e.g. Kendra) for certain use cases with Cortex Search — fewer moving parts, no separate infrastructure to manage.

```sql
CREATE CORTEX SEARCH SERVICE policy_search
  ON policy_text
  WAREHOUSE = 'GENAI_WH'
  TARGET_LAG = '1 hour';

-- Query it
SELECT * FROM TABLE(
  SNOWFLAKE.CORTEX.SEARCH_PREVIEW(
    'policy_search',
    '{"query": "what is the overtime approval process?", "columns": ["policy_text", "doc_title"], "limit": 5}'
  )
);
```

### Q4: Explain Cortex Analyst. How is it different from a Text-to-SQL agent?
A: Cortex Analyst is Snowflake's built-in natural-language-to-analytics tool. You give it a semantic model (YAML file describing your tables, columns, measures, dimensions in business terms) and users ask questions in plain English.

Difference from a Text-to-SQL agent (like what we built with LangChain):
- Cortex Analyst: managed by Snowflake, uses their semantic model, no code to maintain, handles ambiguity using the semantic layer
- LangChain SQL Agent: you control the LLM, the prompts, the tools. More flexible but you own the infrastructure and accuracy

You can use both: Cortex Analyst for self-service dashboarding questions from non-technical users, and a LangChain agent for complex multi-step queries that need custom logic (joining across databases, applying business rules).

### Q5: How do you set up a semantic model for Cortex Analyst?
A: YAML file that describes your data in business terms:
```yaml
name: sales_model
tables:
  - name: DAILY_SALES
    description: "Daily sales by region"
    columns:
      - name: FORECAST_AMT
        description: "Forecasted sales amount"
        synonyms: ["forecast", "expected sales"]
      - name: ACTUAL_AMT
        description: "Actual observed sales amount"
      - name: SALES_DATE
        description: "Date of the sale"
    measures:
      - name: avg_forecast_error
        expression: "AVG(ABS(FORECAST_AMT - ACTUAL_AMT))"
        description: "Average absolute forecast error"
```
Upload to a stage, point Cortex Analyst at it. Users then ask: "What was the average forecast error last week?" and get results.

### Q6: What are the limitations of Cortex AI?
A: Honest answer:
- Region availability — not in all Snowflake regions yet
- Model selection is limited compared to Bedrock/Azure (you get what Snowflake offers)
- Cortex Search lag — there's a target_lag, not truly real-time for rapidly changing data
- Cortex Analyst needs a well-defined semantic model — garbage in, garbage out
- Token limits on LLM functions — large documents need chunking first
- Cost — Cortex credits are separate from compute credits, need to budget for it

That said, for data that already lives in Snowflake, the governance and simplicity benefits outweigh these.

### Q7: How would you implement RAG using only Snowflake (no external services)?
A: Full Snowflake-native RAG stack:
1. Store documents in a table (raw text column)
2. Create a Cortex Search service on that column (handles embeddings + indexing)
3. At query time: call Cortex Search to retrieve relevant chunks
4. Pass retrieved context + user question to SNOWFLAKE.CORTEX.COMPLETE() for generation
5. Return answer with source references

```sql
-- Retrieve
WITH relevant_docs AS (
  SELECT doc_text, doc_title, score
  FROM TABLE(SNOWFLAKE.CORTEX.SEARCH_PREVIEW('my_search_service', 
    '{"query": "' || :user_question || '", "limit": 3}'))
)
-- Generate
SELECT SNOWFLAKE.CORTEX.COMPLETE(
  'mistral-large',
  'Based on the following context, answer the question.\n\nContext: ' || 
  LISTAGG(doc_text, '\n---\n') || '\n\nQuestion: ' || :user_question
) as answer
FROM relevant_docs;
```

No Python, no Lambda, no vector DB. Pure SQL.

### Q8: How does Cortex AI handle data governance compared to external LLMs?
A: This is the main selling point:
- Data never leaves Snowflake's security perimeter
- Existing RBAC applies — if a user can't see a column, Cortex can't use it either
- Row-level security, column masking, data sharing policies all respected
- No training on your data (Snowflake's commitment)
- Audit trail through Snowflake's query history
- Compliant with whatever your Snowflake instance is certified for (SOC2, HIPAA, etc.)

Compare to calling Bedrock or OpenAI: you're sending data over the wire, relying on their retention policies, managing separate access controls.

### Q9: What Cortex LLM models are available and how do you choose?
A: As of now:
- **mistral-large** — good general purpose, fast
- **llama3.1-70b/405b** — open source, strong reasoning
- **snowflake-arctic** — Snowflake's own model, optimized for enterprise tasks
- **claude (via partnership)** — strong reasoning

How I choose: 
- Classification/extraction → smaller model (faster, cheaper)
- Summarization → mistral-large (good quality, reasonable speed)  
- Complex reasoning → larger model
- Start small, benchmark, scale up only if quality isn't there

### Q10: How do you monitor and evaluate Cortex AI output quality?
A: Same as any LLM system — you need evaluation:
- Sample outputs manually (spot-check summaries, classifications)
- For classification: compare against known labels, track accuracy over time
- For search: check if top results are actually relevant (precision@k)
- For Analyst: verify generated SQL produces correct numbers against known queries
- Cost tracking: monitor credit consumption per function, per query pattern
- Set up alerts: if classification confidence drops or latency spikes

We log every Cortex function call result and periodically review a random sample. No auto-eval framework yet (that's the honest gap — would use something like RAGAS or custom SQL-based checks).

### Q11: Can you combine Cortex with external LLMs? When would you?
A: Yes, and it's a common pattern. Use Cortex for data-side operations (summarize what's in Snowflake, search internal docs, classify records). Use Bedrock/external LLMs for user-facing conversational AI (streaming responses, multi-turn chat, complex agentic flows).

The split: if the task is "do something with data already in Snowflake" → Cortex. If the task is "have a real-time conversation with a user" → external LLM with streaming.

Cortex doesn't support streaming responses or multi-turn conversation state natively — that's where your application layer (FastAPI + Bedrock) still matters.

### Q12: What's the difference between COMPLETE(), SUMMARIZE(), and CLASSIFY_TEXT()?
A: All are Cortex LLM Functions but different abstraction levels:
- **COMPLETE(model, prompt)** — raw prompt → response. You write the full prompt. Most flexible.
- **SUMMARIZE(text)** — one-liner. Give it text, get a summary. No prompt engineering needed.
- **CLASSIFY_TEXT(text, categories)** — give text + list of categories, returns the matching category.

SUMMARIZE and CLASSIFY_TEXT are convenience wrappers. Under the hood they're calling COMPLETE with a well-tuned prompt. Use the wrappers for standard tasks. Use COMPLETE when you need custom logic or specific output formats.

---

## Section 8: Snowflake Architecture — Deep Technical Q&A

### Q1: How do dynamic tables work and when do you use them?
A: Dynamic tables are declarative — you write a SELECT statement defining the transformation, and Snowflake materializes and refreshes it automatically. You set a target_lag (how stale you're OK with). Snowflake figures out the refresh schedule.

I use them for: operational dashboards (5-min lag is fine), aggregation layers, slowly-changing dimensions that need periodic refresh. Replaced a bunch of stored procedures + tasks that were doing the same thing with more code.

### Q2: Streams and tasks vs dynamic tables — when which?
A: 
- **Streams + Tasks**: Fine-grained control. You decide exactly when, how, and what to process. Good for complex CDC pipelines where you need custom merge logic, error handling, or conditional branching.
- **Dynamic tables**: Declarative, less code. Snowflake handles the when. Good for straightforward transformations where "just keep this view fresh" is the requirement.

Rule of thumb: if your transformation is a single SELECT statement, use dynamic table. If you need IF/ELSE logic, error handling, or multi-step processing, use streams + tasks.

### Q3: How do you performance-tune Snowflake queries?
A: My checklist:
- Check query profile in Web UI (look for spilling to disk, partition pruning)
- Clustering keys for large tables with predictable filter patterns
- Right-size warehouses (don't run a 4XL for a simple query)
- Separate warehouses for ETL vs analytics (don't let batch jobs block dashboards)
- Avoid SELECT * — project only needed columns
- Materialized views or dynamic tables for expensive repeated computations
- Result caching — same query within 24h uses cached results
- Micro-partition metadata — leverage date columns for natural pruning

### Q4: Explain Snowflake's data sharing and when you've used it.
A: Zero-copy data sharing — consumer sees a live view of producer's data. No data movement, no copies. Consumer pays for compute, producer pays for storage.

A common use is cross-business-unit access — one team shares production data with another. No ETL, no duplicated tables, always current. Also useful for vendor data feeds coming in via Snowflake Marketplace.

### Q5: How do you handle RBAC and governance in Snowflake?
A: Hierarchy: Account Admin → Security Admin → role hierarchy. A typical setup:
- Functional roles (DATA_ENGINEER, ANALYST, DATA_SCIENTIST)
- Database-level roles (EDW_READER, EDW_WRITER)
- Object-level grants (specific schemas/tables)
- Dynamic data masking on PII columns
- Row access policies for multi-tenant data
- Network policies to restrict access by IP
- All changes tracked in access_history view for auditing
---------

## Section 9: Cloud & AI Practice Lead Interview Q&A (Consulting Role)

### Q1: 1000 users are using Copilot/Sonnet for code debugging. Tokens are burning fast. How do you optimize?
A: Multiple layers:
- Summarize conversation history before passing to LLM (don't send full chat every time)
- Filter and trim context - only pass relevant code snippets, not entire files
- Set max token limits on responses
- Cache frequent queries - same question from multiple devs shouldn't hit the LLM twice
- Use smaller models for simple tasks (classification, linting) and larger models only for complex reasoning
- Implement token budgets per user/team with alerts

### Q2: Customer says "1000 Copilot licenses, cost keeps going up, but we're not seeing value. Convince me to keep it."
A: You can't convince with advice alone. You need numbers from their own data:
- Pull their actual usage metrics: how many devs are actively using it vs just have a license sitting idle
- Check acceptance rates - if devs are rejecting 80% of suggestions, the tool isn't configured right for their codebase
- Compare velocity: are teams shipping faster or not? Pick 2 teams - one using it heavily, one not. Compare their sprint output.
- If the data shows it's not helping, don't fight it. Recommend reducing licenses to just the teams getting value, and invest the savings in training the others on how to actually use it (prompt patterns, context setup, .cursorrules/.github/copilot-instructions)

Honest point: if after training and proper setup it still shows no value, maybe their codebase or workflow isn't a good fit. Not every org gets the same ROI from coding assistants. Better to admit that than oversell.

### Q3: AI practice approach - how do you position AI within a data engineering org?
A: Don't try to turn everything into GenAI. Start from the data engineering foundation and layer AI where it actually helps:
- Identify 3-5 use cases where AI saves real time (document processing, data quality checks, SQL generation)
- Build on existing data infrastructure - don't create a separate AI silo
- The best AI use cases in data engineering: automated data quality, schema mapping, code generation for ETL, natural language to SQL, anomaly detection
- Avoid the trap of "AI for everything" - some problems are just SQL problems

### Q4: Explain RAG in simple terms with a real example.
A: Retrieval Augmented Generation. The LLM doesn't know your company's internal data, so you feed it relevant context at query time.

Flow:
1. Documents get chunked and converted to embeddings (vectors)
2. Stored in a vector database (Pinecone, FAISS, Snowflake Cortex Search)
3. User asks a question - that question also becomes a vector
4. Semantic search finds the closest matching chunks (BM25 + vector similarity)
5. Those chunks get stuffed into the prompt as context
6. LLM generates an answer grounded in your actual documents

Improvements beyond basic RAG:
- Before retrieval: query rewriting, HyDE (hypothetical document embeddings), decomposition
- After retrieval: reranking (cross-encoder), filtering low-relevance chunks
- Multi-query: break complex questions into sub-queries, retrieve for each

### Q5: Client is hesitant about AI investment. How do you show ROI for legacy-to-AI migration?
A: Don't show a fancy 5-year model nobody believes. Show one real example that already worked:

A realistic scenario: a team of 4 people spending 2-3 months onboarding each new data feed manually - approvals, validation, schema mapping, testing. After building an automated ingestion framework with AI-assisted data quality checks:
- Feed onboarding went from 2-3 months to 2-3 weeks
- Manual validation that took a full person-week now runs automatically in 20 minutes
- When one developer left, we didn't lose 3 months of ramp-up time because the process was codified

The math the client cares about:
- Current cost: 4 developers x $150K/year = $600K + risk of tribal knowledge loss
- AI automation cost: $200K one-time build + $50K/year maintenance
- Payback: under 12 months, and it doesn't quit or need PTO

But be honest: AI doesn't replace everything. It handles the repetitive 60% so your expensive people focus on the hard 40%. Frame it as "your developers do higher-value work" not "we fire people."

### Q6: Client says "I had 25 resources last year, I want to cut to 5. How?"
A: Straight answer: you can't go from 25 to 5 and still have a functioning team. Here's why:

What AI CAN replace:
- Manual report generation (automated)
- Data validation checks (automated)
- Routine monitoring and alerting (automated)
- Simple query answering (self-service tools, Cortex Analyst)
- Repetitive data onboarding (framework + AI quality checks)

What AI CANNOT replace:
- Production incident response at 2am - someone needs to think and fix
- Complex debugging when data doesn't match and nobody knows why
- New feature development where requirements are unclear
- Vendor/stakeholder communication
- Security and compliance decisions

Realistic suggestion: 25 to 12-15 over 12 months. Automate the repetitive stuff first, prove it works for 3 months, then reduce. Going to 5 means one person leaves and you're in crisis. No responsible engineer would recommend that.

### Q7: Customer wants to migrate from on-prem to cloud. What's your approach?
A: Based on common migration experience (Oracle/SQL Server to Snowflake, on-prem Informatica to AWS):

1. First, understand what you're migrating - not everything needs to move. Some legacy systems are fine where they are.
2. Pick the target based on workload: Snowflake for analytics/data warehouse, Aurora/RDS for transactional, S3 for raw storage.
3. Data migration: AWS DMS for initial bulk load + CDC for ongoing sync during parallel-run period.
4. ETL migration: don't lift-and-shift Informatica to the cloud. Rewrite as ELT in Snowflake (tasks, stored procs, dynamic tables) or Python pipelines.
5. Run both systems in parallel for 2-4 weeks. Compare outputs daily. Fix discrepancies before cutover.
6. Cutover with a rollback plan - keep the old system alive for 30 days after.

What I'd tell the client upfront: "Migration is not just moving data. It's an opportunity to simplify. Half your on-prem complexity exists because of old limitations that cloud doesn't have. Let's drop what we don't need."

### Q8: Tell me about your Spark/Python experience.
A: I use Python daily for automation, data pipelines, and AI application backends. I'm not writing complex Spark frameworks from scratch, but I know enough to:
- Write PySpark transformations when the dataset is too large for single-node processing
- Understand execution plans - when things are slow, I can read the DAG and fix partition skew or unnecessary shuffles
- Tune jobs: adjust partition counts, use broadcast joins for small lookup tables, cache intermediate results

Most of my Python work is: FastAPI backends, boto3 automation, Snowflake connector scripts, LangChain pipelines, monitoring/alerting tools, data comparison scripts. I write production code that runs daily - I just use AI tools to write it faster.

### Q9: Interviewer feedback - "You're more data than cloud. For this role you need to..."
A: Key takeaway - consulting practice lead roles want:
- Customer-facing skills: proposals, RFPs, stakeholder presentations
- Practice building: certification offerings, reusable accelerators, team mentoring
- Breadth: infrastructure + AI + data (not just data engineering)
- Commercial awareness: scoping, pricing, resource planning
- Landing zone creation, data lake design, exit criteria for migrations across multiple workloads





---

## Section 10: Agentic Observability & LangSmith

### Q1: How do you monitor AI agents in production?
A: Agentic observability - you trace the full execution path, not just the final output:

Flow: AI Agent Execution -> LangSmith Tracing -> Observability Agent -> Root Cause Analysis -> Incident Report

How it works end-to-end:
1. Agent executes tasks - each LLM call, tool use, and retrieval step is instrumented
2. LangSmith captures full execution traces with latency, token usage, and outputs
3. Observability agent analyzes traces in real-time for anomalies and failures
4. On failure - agent traces root cause, identifies responsible component/team
5. Generates incident report with fix suggestions and ownership assignment

### Q2: How do you instrument agents with LangSmith?
A: Four key instrumentation points:

1. @traceable Decorator - auto-captures inputs, outputs, and latency for every function
2. Run Trees - nested trace hierarchy showing agent -> tool -> LLM call chain
3. Custom Metadata - tag runs with user ID, session, environment for filtering
4. Feedback Scores - attach quality scores to runs for evaluation pipelines

Setup is simple:
```python
from langchain import *
from langsmith import *

# Initialize LangSmith tracing
os.environ["LANGCHAIN_TRACING_V2"] = "true"

# Create observable agent
@traceable
def agent_run(query):
    result = llm.invoke(query)
    tools.execute(result)
    return finalize(result)
```

### Q3: How do you trace failures and do root cause analysis on AI agents?
A: Each step in the agent pipeline gets a pass/fail status. When something breaks, you walk the chain:

Example failure trace:
- User Query (pass) -> Agent Planning (pass) -> LLM Call (pass) -> Tool: DB Query (FAIL) -> Response Generation (skipped)

Root cause identified:
- Failure Point: DB Query Tool - Timeout after 30s
- Error Chain: Agent -> LLM -> Tool:db_query -> ConnectionPool -> TimeoutError
- Impact: User query failed - no response generated
- Owner: Backend / Database Team
- Suggested Fix: Increase connection pool size, add retry logic with exponential backoff
- Confidence: 92% - based on 47 similar past incidents

This is the kind of observability you need when running agents in prod. Without it you're just guessing why things broke.

### Q4: What's the difference between logging and agentic observability?
A: 
- Logging: "something happened" - flat text lines, no structure, hard to correlate
- Agentic observability: "here's the full execution tree with timing, tokens, success/failure at each node, and how they connect"

With logging you see: "ERROR: timeout in db_query"
With observability you see: "User asked X -> agent planned 3 steps -> step 1 and 2 succeeded in 2s -> step 3 (db_query) failed after 30s timeout -> this is the 47th time this week -> the fix is connection pool sizing -> assign to backend team"

Tools: LangSmith, LangFuse, Arize Phoenix, OpenTelemetry (for custom setups)

### Q5: How does this relate to what you built?
A: A typical platform has application-level observability (CloudWatch logs, DynamoDB conversation tracking, user feedback, keyword trends). What's often missing is LLM-trace-level observability like LangSmith provides.

What we'd gain by adding it:
- See exactly which retrieval step returned bad context (causing bad answers)
- Track token costs per bot module, per user, per query type
- Identify which prompt templates perform best (A/B at the trace level)
- Auto-detect when a bot starts giving lower-quality answers (drift)

It's on the roadmap. The honest gap is: we monitor the application, but not yet the individual LLM reasoning steps.
