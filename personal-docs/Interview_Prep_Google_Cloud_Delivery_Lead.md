---
icon: material/account-supervisor
---

# Interview Preparation: Google Cloud Senior Delivery Lead / Technical Delivery Manager

*Last reviewed: October 2026*

!!! note "Model note"
    The project below ran on Claude 3.5 Sonnet, which was retired on the Anthropic API in
    October 2025. Describe it as built, and say you would re-run the eval set and migrate
    to a current model behind a flag.

---

## Part 1: Role Summary & What to Expect

### Role Overview
This is a **Senior Delivery Lead / Technical Delivery Manager** role at a Google Cloud consulting partner focused on mid-market clients. The role is:
- **70% Delivery Management** — owning client engagements end-to-end (scope, timeline, team, quality, outcomes)
- **30% Technical** — providing advisory across data engineering, analytics, and AI/ML workstreams on GCP

### Key Expectations
1. **Single point of accountability** for client delivery
2. **Shape delivery approach** for complex data + AI engagements
3. **Partner with solution engineers** (they own architecture, you own execution)
4. **Lead across borders** — onshore leadership + offshore engineering teams
5. **Get solutions into clients' hands fast** — weeks, not quarters
6. **Drive quality and outcomes** — delivery governance, checkpoints, measurable value

### Travel
25% to 100% depending on client needs.

---

## Part 2: Mapping My Current Project to Job Requirements

### My Current Platform: Multi-Bot Conversational AI Platform (energy utility)

**What I Built:**
- Multi-bot conversational AI platform on AWS
- React/TypeScript frontend (Vite + Tailwind)
- FastAPI backend in Docker on Lambda behind API Gateway
- Real-time streaming via WebSocket API Gateway
- LLM: Amazon Bedrock Claude 3.5 Sonnet
- Auth: AWS Cognito (JWT)
- Storage: DynamoDB (conversations), S3 (documents)
- Infrastructure: AWS CDK (TypeScript), Jenkins CI/CD
- 4 environments: sand/dev/test/prod

**Bot Types Supported (8+):**
- Policy Q&A (RAG-based)
- SQL Agent (English → Snowflake queries)
- IT Helpdesk
- Field-Crew Dispatch
- Document Processing
- Content Assist
- Procurement Audit Bot (batch)

### My Procurement Audit Bot (Production AI System)

**Architecture:**
```
EventBridge (daily cron)
  → Lambda 1 → Snowflake (get new PO list) → SQS
  → Lambda 2 → Procurement API (fetch PO data) → S3
  → Lambda 3 → S3 (read PO JSON) + Snowflake (PO details)
             → Bedrock Claude 3.5 Sonnet (9 audit checks via LangChain)
             → DynamoDB + S3 CSV (save audit results)
```

**9-Point AI Audit Checklist:**
1. Verbiage Evaluation
2. Line Description Evaluation
3. Justification Evaluation
4. Attachment Evaluation
5. Amount vs Quantity Check
6. Due Date Evaluation
7. Contract Evaluation
8. Commodity Evaluation
9. SSM (Sole Source) Evaluation

Each check returns: **Pass / Fail / NA** with reason.

### My MCP Server (Model Context Protocol)

Built a custom MCP server for Snowflake (`snowflake_agent.py`) that exposes:
- SQL query execution with safety guards (blocks writes on prod)
- Database/schema/table listing
- Table description and data preview
- Query history and explain plans
- Object search across schemas
- Persistent connection management with token caching

---

## Part 3: Direct Skill Mapping

| Job Requirement | My Direct Experience |
|----------------|---------------------|
| **Agentic AI / MCP** | Built custom MCP server for Snowflake; use MCP daily for AI-assisted development |
| **RAG patterns** | Conversational bot — document upload, Textract extraction, context injection into prompts |
| **Production AI systems** | Procurement audit bot — nightly batch, 9-point LLM checklist, hundreds of POs in production |
| **Agent orchestration & tool use** | SQL Agent: LLM → Snowflake; multi-bot platform with 8+ bot types, each with different tool chains |
| **Data Engineering / Pipelines** | EventBridge → Lambda → Snowflake → SQS → S3 → Bedrock pipeline |
| **MLOps / deployment** | Docker → ECR → CDK → Jenkins CI/CD, multi-environment deployment |
| **LLM optimization** | Temperature 0.0, ThreadPoolExecutor 40 workers, VPC endpoints, streaming, prompt caching |
| **Real-time AI** | WebSocket streaming, token-by-token delivery, connection state management |
| **Data platforms** | Snowflake (heavy user — queries, pipelines, schema design), DynamoDB, S3 data lake patterns |
| **Analytics & BI** | SQL Agent translates English to analytics queries; operational dashboards via conversation metrics |
| **Security** | VPC endpoints for Bedrock (no public internet), Cognito JWT auth, guardrail enforcement, consent tracking |
| **Observability** | CloudWatch, DynamoDB conversation tracking, user feedback, keyword trends, guardrail logging |

---

## Part 4: Gaps & How to Bridge Them

| Job Requirement | Gap | Bridge Strategy |
|----------------|-----|-----------------|
| **Google Cloud (BigQuery, Vertex AI, Dataflow)** | I'm on AWS (Bedrock, Lambda, DynamoDB) | "Same patterns, different cloud. BigQuery ↔ Snowflake, Vertex AI ↔ Bedrock, Dataflow ↔ Lambda+SQS pipelines. Concepts transfer directly." |
| **Google Cloud Certifications** | Likely none currently | "I'm pursuing GCP Professional Data Engineer certification. My AWS production experience maps directly to GCP services." |
| **Gemini Enterprise Agent Platform / ADK / A2A** | No direct experience | "I have hands-on MCP experience (which is listed in your requirements). MCP (agent ↔ tools) and A2A (agent ↔ agent) are open protocols, and ADK is Google's framework that speaks both — same mental model as my LangChain + MCP work." |
| **Client-facing delivery leadership at scale** | I build and deliver, less formal PM | "I own end-to-end delivery of an enterprise AI platform — requirements, architecture, implementation, deployment, stakeholder demos, production support." |
| **Looker / Connected Sheets** | Not directly used | "I've built analytics layers via SQL Agent that serve similar purposes — making data accessible to business users through natural language." |

---

## Part 5: Prepared Interview Answers

### Q: "Tell me about a complex AI engagement you delivered end-to-end"

**A:** "I built an enterprise GenAI platform from zero to production. It's a multi-bot conversational platform: React frontend, FastAPI backend on Lambda, Bedrock Claude 3.5 Sonnet, WebSocket streaming, Cognito auth. Supports 8+ bot types including a SQL agent that translates English to Snowflake queries, policy Q&A with RAG, and a procurement audit bot processing hundreds of POs nightly with a 9-point LLM compliance checklist. Infrastructure as code with CDK, deployed across 4 environments via Jenkins. I owned it end-to-end — scoping, architecture decisions, implementation, deployment, and stakeholder communication."

---

### Q: "Experience with MCP or Agent orchestration?"

**A:** "I built a custom MCP server for Snowflake that exposes database tools — query execution, schema discovery, table search — through the Model Context Protocol. It includes safety guards that block write operations on production while allowing them on dev/test. I use MCP daily for AI-assisted development.

For agent orchestration, the SQL agent uses LangChain to chain: user question → schema context injection → LLM SQL generation → validation → Snowflake execution → response formatting. The procurement bot orchestrates three Lambdas with SQS for decoupling, parallel processing with ThreadPoolExecutor (40 workers), and structured output (Pass/Fail/NA) from each LLM call."

---

### Q: "How do you handle delivery across multiple workstreams?"

**A:** "The procurement platform has three parallel workstreams:
1. **Data ingestion** — EventBridge triggers Lambda to pull from Snowflake + a procurement API via OAuth2
2. **AI processing** — Bedrock batch audit with 40-worker parallelism, chunked into groups of 20
3. **Results delivery** — DynamoDB + S3 CSV for downstream finance review

I coordinate dependencies: Lambda 2 must complete S3 writes before Lambda 3 reads. I define phase gates and use Batch_Run_IDs to track quality across runs. Human reviewers validate AI findings (accept/reject counts tracked), creating a feedback loop for accuracy improvement."

---

### Q: "Production AI — not just prototypes?"

**A:** "The procurement bot runs nightly in production. Processes live POs from the procurement system, validates against company policies, stores structured results for finance team review. It handles edge cases — OAuth token refresh, VPC networking, connection retry logic, chunked processing for large batches.

The conversational platform handles real users daily — consent tracking, pre-inference guardrail enforcement, user feedback loops (thumbs up/down), admin toggles for feature control per bot, keyword trend analysis. Not a demo — it's serving the organization."

---

### Q: "How do you ensure quality and governance in AI delivery?"

**A:** "Multiple layers:
- **Pre-inference:** Guardrail check classifies every prompt before reaching the LLM — blocks malicious/restricted content
- **During inference:** Temperature 0.0 for repeatable outputs, structured output schema (Pass/Fail/NA with reason)
- **Post-inference:** Human review workflow — accept/reject counts tracked per batch run
- **Operational:** Batch run ID tracking, CloudWatch monitoring, keyword trend analysis, consent management
- **Deployment:** 4-environment promotion (sand → dev → test → prod), CDK infrastructure as code, Jenkins pipelines"

---

### Q: "How would you adapt to Google Cloud from AWS?"

**A:** "The patterns I've implemented map directly:
- **Bedrock → Vertex AI (Gemini Enterprise Agent Platform for agents)**: Same concept — managed LLM inference, just different SDK calls
- **Lambda → Cloud Run / Cloud Run functions** (formerly Cloud Functions): Serverless compute with container support
- **DynamoDB → Firestore/Bigtable**: NoSQL with PK/SK patterns
- **Snowflake → BigQuery**: Columnar analytics (I already write complex SQL daily)
- **SQS → Pub/Sub**: Message queue decoupling
- **EventBridge → Cloud Scheduler**: Cron-based triggers
- **CDK → Terraform** (or Infrastructure Manager, Google's managed Terraform): Infrastructure as code
- **S3 → Cloud Storage**: Object storage

The architectural thinking — data pipelines, agent orchestration, LLM integration, production governance — is cloud-agnostic. I'd ramp up on GCP-specific services quickly because I understand the underlying patterns."

---

### Q: "Experience with RAG and retrieval patterns?"

**A:** "In the platform:
1. **Document ingestion**: Users upload PDF/DOCX/XLSX/images to S3 via presigned URLs
2. **Extraction**: Textract pulls content from documents
3. **Retrieval**: Content indexed and retrieved at query time based on relevance
4. **Augmentation**: Retrieved content injected into prompt context before LLM call
5. **Generation**: Claude generates response grounded in retrieved documents

Can also integrate with an enterprise document store (e.g. SharePoint). We handle deduplication (checksum check), support multiple file types, and track retrieval quality through user feedback.

I'm familiar with advanced RAG patterns: hybrid search (BM25 + semantic), reranking, query rewriting, metadata filtering, and modular/agentic RAG where the agent decides when and how to retrieve."

---

### Q: "How do you manage cost in production AI?"

**A:** "Strategies we use:
- **Batching**: Process POs in chunks of 20 to optimize API calls
- **Guardrails**: Block unnecessary LLM calls early (pre-inference check)
- **Repeatable outputs**: Temperature 0.0 plus a strict output schema reduces parse failures and retries
- **Batch inference**: For nightly jobs, provider batch APIs (Bedrock batch inference, Vertex AI batch prediction) are typically about half the on-demand price
- **Parallel processing**: ThreadPoolExecutor (40 workers) maximizes throughput per compute hour
- **VPC endpoints**: Reduce data transfer costs and latency
- **Structured prompts**: Concise templates to minimize token usage
- **Caching**: Avoid reprocessing unchanged POs (checksum dedup)
- **Right-sizing**: Lambda memory/timeout tuned per function
- **Environment separation**: Heavy testing in sand/dev, minimal prod costs"

---

### Q: "Tell me about leading distributed teams?"

**A:** "On the platform, I coordinate across:
- **Backend development** (Python/FastAPI)
- **Frontend development** (React/TypeScript)
- **Infrastructure/DevOps** (CDK, Jenkins, AWS services)
- **Data engineering** (Snowflake, pipeline design)
- **Business stakeholders** (finance team for procurement, IT for helpdesk)

I set priorities, define workstream boundaries, manage dependencies (e.g., API contracts between frontend and backend), and ensure each team has clear deliverables. For the procurement bot specifically, I coordinate between the data ingestion team (Lambda 1+2) and the AI processing team (Lambda 3) with well-defined S3 data contracts."

---

## Part 6: Technical Deep-Dive Answers (If Asked)

### Architecture Decisions

**Why WebSocket over REST for LLM responses?**
"API Gateway REST integrations default to a 29-second timeout (raisable for Regional APIs since 2024, but streaming is still the better UX). LLM responses can take longer and users expect real-time feedback. WebSocket streaming solves both — tokens stream as generated, user sees response immediately, no timeout issues."

**Why SQS between Lambda 1 and Lambda 2?**
"Decoupling. Lambda 1 discovers POs, Lambda 2 fetches details from the procurement API. SQS provides: (1) rate limiting — don't overwhelm the API, (2) retry handling — if the API is temporarily down, messages stay in queue, (3) scalability — multiple Lambda 2 instances can process in parallel."

**Why DynamoDB for conversations?**
"Sub-millisecond reads at any scale. PK=user_id, SK=conversation_id gives us instant access to any user's any conversation. MessageMap (JSON) supports branching conversation trees. No schema migrations needed as we add features."

**Why VPC Endpoints for Bedrock?**
"Security requirement — no enterprise data traverses the public internet. VPC endpoint keeps Bedrock API calls within the AWS private network. Also reduces latency vs going through NAT gateway."

---

### Data Pipeline Design

**How would you design a data pipeline on GCP?**
"Based on my AWS pipeline experience, the GCP equivalent would be:
1. **Ingestion**: Cloud Scheduler → Cloud Run functions (trigger) → BigQuery (source query)
2. **Processing**: Pub/Sub (queue) → Cloud Run (fetch external data) → Cloud Storage (raw data)
3. **AI Processing**: Cloud Run (Docker) → Vertex AI (LLM inference) → BigQuery (results)
4. **Orchestration**: Cloud Composer (Airflow) for complex DAGs, or simple Cloud Scheduler for linear flows
5. **Monitoring**: Cloud Logging + Cloud Monitoring + Error Reporting"

---

### Agentic AI Patterns

**My understanding of the ecosystem:**
- **MCP (Model Context Protocol)**: I've built this — protocol for tools to expose capabilities to LLMs
- **A2A (Agent-to-Agent)**: Open protocol (started by Google, now a Linux Foundation project) for agents to discover each other via Agent Cards and delegate tasks (loosely analogous to my Lambda-to-Lambda orchestration via SQS, but between autonomous agents)
- **ADK (Agent Development Kit)**: Google's open-source framework for building agents (analogous to my LangChain-based agent implementations)
- **Gemini Enterprise Agent Platform**: Google's managed platform for building, deploying and governing agents, announced at Next '26 (analogous to my CDK-deployed Lambda-based agent infrastructure)

**Key concepts I've implemented:**
- **Tool use**: LLM decides which tool to call (SQL Agent picks Snowflake queries)
- **Grounding**: RAG provides factual context to prevent hallucination
- **Orchestration**: Multi-step flows where LLM output drives next action
- **Safety**: Guardrails check before and after LLM calls
- **State management**: DynamoDB tracks conversation state across turns

---

## Part 7: Questions to Ask the Interviewer

1. "What's the typical engagement size and duration for your mid-market clients?"
2. "How do you handle the transition from sales engineering to delivery — what artifacts do you receive?"
3. "What's your current team structure for a typical data + AI engagement?"
4. "How mature are clients typically in their GCP adoption when you engage?"
5. "What percentage of engagements involve greenfield GCP adoption vs. modernization of existing platforms?"
6. "How do you measure delivery success — is it milestone-based, outcome-based, or both?"
7. "What's the balance between hands-on technical work vs. delivery management in the first 6 months?"

---

## Part 8: Domain Knowledge Cheat Sheet

### GCP Services Mapping (AWS → GCP)

| AWS Service | GCP Equivalent | My Experience Level |
|-------------|---------------|-------------------|
| Bedrock | Vertex AI / Gemini Enterprise Agent Platform | Heavy (Bedrock) — need GCP ramp |
| Lambda | Cloud Run functions / Cloud Run | Heavy (Lambda) |
| DynamoDB | Firestore / Bigtable | Heavy (DynamoDB) |
| S3 | Cloud Storage | Heavy (S3) |
| SQS | Pub/Sub | Medium (SQS) |
| EventBridge | Cloud Scheduler / Eventarc | Medium (EventBridge) |
| API Gateway | API Gateway / Cloud Endpoints | Heavy (API Gateway) |
| Cognito | Identity Platform / Firebase Auth | Medium (Cognito) |
| CDK | Terraform / Infrastructure Manager | Heavy (CDK) |
| CloudWatch | Cloud Logging / Monitoring | Medium (CloudWatch) |
| ECR | Artifact Registry | Medium (ECR) |
| Snowflake | BigQuery | Heavy (Snowflake) |
| Textract | Document AI | Medium (Textract) |
| SSM | Secret Manager | Medium (SSM) |

### Key GCP Terminology to Know

- **BigQuery**: Serverless data warehouse (petabyte-scale, SQL-based)
- **Vertex AI**: Unified ML platform (model training, deployment, prediction)
- **Gemini**: Google's family of LLMs (equivalent to Claude/GPT)
- **Dataflow**: Apache Beam-based stream/batch processing
- **Pub/Sub**: Messaging service for event-driven architectures
- **Cloud Composer**: Managed Apache Airflow for workflow orchestration
- **Looker**: BI and analytics platform (semantic modeling)
- **Cloud SQL / Spanner**: Managed relational databases
- **Bigtable**: Wide-column NoSQL (low-latency, high-throughput)
- **GKE**: Google Kubernetes Engine
- **Terraform**: Infrastructure as code (Deployment Manager is deprecated; Infrastructure Manager runs Terraform as a managed service)

### Agentic AI Terminology

- **MCP (Model Context Protocol)**: Open protocol for tools to expose capabilities to AI models
- **A2A (Agent-to-Agent)**: Open protocol for multi-agent communication (Google-originated, Linux Foundation-hosted)
- **ADK (Agent Development Kit)**: Google's SDK for building AI agents
- **Gemini Enterprise Agent Platform**: Managed service for deploying production agents
- **Grounding**: Connecting LLM responses to factual data sources
- **Tool Use**: LLM's ability to call external functions/APIs
- **RAG**: Retrieval-Augmented Generation — grounding LLM in retrieved documents

---

## Part 9: 30-60-90 Day Plan (If Asked)

### First 30 Days
- Obtain GCP Professional Data Engineer certification
- Shadow 2-3 active client engagements to understand delivery patterns
- Learn internal delivery frameworks, templates, and governance processes
- Set up personal GCP environment and replicate my AI pipeline patterns on GCP

### 30-60 Days
- Take ownership of a client engagement (with support)
- Deliver first milestone — likely data platform setup or AI POC
- Build relationships with offshore engineering team
- Establish delivery cadence (standups, status reviews, demos)

### 60-90 Days
- Independently own 1-2 client engagements
- Drive delivery planning for new deals transitioning from sales
- Contribute to delivery playbooks based on my production AI experience
- Mentor team on agentic AI patterns (MCP, RAG, tool use)

---

## Part 10: Salary & Negotiation Notes

### What to Research
- Market rate for GCP Delivery Leads with 7+ years experience
- Google Cloud Partner ecosystem compensation ranges
- Factor in travel requirements (25-100%)

### Your Leverage Points
- **Production MCP experience** — rare and explicitly listed as differentiator
- **End-to-end AI delivery** — not just prototypes
- **Multi-bot platform** — demonstrates complex system design
- **Data engineering + AI** — covers both pillars they need
- **Immediate contribution** — can start delivering from day one on AI workstreams
