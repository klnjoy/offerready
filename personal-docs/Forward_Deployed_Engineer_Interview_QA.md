---
icon: material/account-tie
---

# Forward Deployed Engineer (FDE) — Interview Questions & Answers

*Last reviewed: October 2026*

## About the Role
A Forward Deployed Engineer works directly with customers to deploy AI/ML solutions, solve complex technical problems, and bridge the gap between cutting-edge AI capabilities and real business outcomes. FDEs combine deep AI/ML engineering skills, strong software engineering, customer-facing communication, and rapid problem-solving ability.

---

## 1. Technical Problem-Solving

**Q: Describe a time you had to debug a production data issue under time pressure. What was your approach?**

A: On one project we discovered duplicate expense transactions inflating financial reports by hundreds of thousands of rows. I traced the issue across the full data pipeline:
- Started at the landing table — confirmed only 1 record existed
- Checked the staging view — confirmed it passes a reference ID directly as a reference number
- Found the downstream MERGE key included that reference number — so when the source corrected a reference number from date-format to a new format, the merge inserted a new row instead of updating
- Identified a bulk correction of several million rows as the triggering event
- Delivered a targeted DELETE that only removes rows where a matching corrected version exists — zero data loss, zero downtime

Key approach: trace the data lineage end-to-end before proposing a fix. Never assume — verify at each layer.

---

**Q: How do you decide between a quick fix and a systemic fix?**

A: I evaluate three factors:
1. **Is the root cause still active?** If the source issue is ongoing, you need a systemic fix. If it was a one-time event (like a bulk reference-ID correction), a one-time cleanup suffices.
2. **What's the blast radius of a systemic change?** Modifying a shared generic procedure (like a generic merge proc used by dozens of tables) carries more risk than a targeted approach.
3. **What's the cost of recurrence?** If the issue could cost millions or delay reporting, invest in prevention. If it's a one-off anomaly, clean it up and move on.

In the finance duplicate case, I initially proposed modifying the unique key or creating scheduled cleanup tasks, but after tracing the root cause to a one-time source correction, I recommended just the one-time delete — simpler, less risk, same outcome.

---

**Q: Walk me through how you'd architect a data pipeline for a new enterprise data source.**

A: Following a data vault / layered approach:
1. **Landing/Raw** — Ingest as-is from source, append-only, maintain full history. MERGE key should be the natural business key (not surrogate or mutable fields).
2. **Staging** — Transform, clean, and enrich via views that join hub/dimension tables. Views are stateless and recomputable.
3. **Target/Mart** — Business-consumable tables. Use MERGE (INSERT/UPDATE) driven by orchestration metadata (a control-table pattern).
4. **Serving** — Secure views for downstream consumers (Tableau, APIs).

Key design decisions:
- Separate concerns: landing captures what the source sends, staging transforms it, target serves it
- Use metadata-driven orchestration (a generic merge proc + control table) for maintainability
- Never include mutable fields in merge keys — a lesson learned from a reference-number incident

---

## 2. Customer-Facing & Communication

**Q: How do you communicate a technical issue to non-technical stakeholders?**

A: I focus on three things: what's wrong, what's the impact, and what's the fix. Example email to a finance team:

- **What's wrong:** "Certain expense transactions appear twice in reports"
- **Impact:** "Hundreds of thousands of duplicate rows; reports may show inflated counts"
- **Root cause (simplified):** "The source system corrected reference numbers in bulk. Our pipeline treated the corrected records as new transactions."
- **Fix:** "We'll remove the stale copies. No data loss — every transaction keeps its correct record."
- **Timeline:** "Fix planned next week"

I avoid jargon (no "MERGE keys" or "QUALIFY clauses") and focus on business impact and resolution.

---

**Q: A customer says "the data is wrong." How do you handle it?**

A: 
1. **Acknowledge and get specifics** — "Can you share the exact query, filters, and expected result?" In the finance case, the user provided a specific transaction month, account, and cost element, and said the source system shows 1 row but the warehouse shows 2.
2. **Reproduce immediately** — Run the same query, confirm the discrepancy
3. **Trace the lineage** — Check each layer (source → landing → staging → target) to find where the divergence starts
4. **Communicate progress** — "I've confirmed the issue and identified the root cause. Fix is in progress."
5. **Deliver with validation** — Provide the fix with before/after proof

---

**Q: How do you prioritize when multiple customers have urgent requests?**

A: 
- **Severity first:** Production data impacting financial reporting > development environment issues > nice-to-have improvements
- **Quick wins:** If something takes 5 minutes and unblocks someone, do it immediately even if it's lower priority
- **Communicate timelines:** Let people know when to expect resolution
- **Parallelize:** Kick off long-running analysis (queries, investigations) while working on quick fixes

---

## 3. Engineering Depth

**Q: Explain how you'd design a deduplication strategy for a high-volume data pipeline.**

A: It depends on where duplication occurs:

**At ingestion (landing):**
- Use natural business keys as the MERGE key (e.g., transaction ID)
- Never include mutable fields (like reference numbers that can change) in the merge key
- Landing table should do UPDATE on match, INSERT on no match

**At transformation (staging):**
- Use `QUALIFY ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)` in views
- Partition by the business key, order by freshness (timestamp or sequence)
- Only the most recent version passes through

**At serving (target):**
- If the target uses a different grain than the source, dedup must happen before the MERGE
- Consider whether your MERGE should support DELETE (for corrections/retractions)

**Lessons learned:** Generic merge procedures are great for maintainability but dangerous when source systems make retroactive key changes. Build in monitoring to detect unexpected row count growth.

---

**Q: What's your experience with Snowflake-specific features?**

A: 
- **Zero-copy cloning** — Used for instant backups before production deletes (no storage cost until data diverges)
- **Time Travel** — Useful for recovering from accidental deletes within retention window
- **Tasks & Streams** — Designed CDC pipelines using streams for change capture and tasks for scheduled orchestration
- **QUALIFY clause** — Snowflake's window function filter; cleaner than subqueries for dedup
- **JavaScript stored procedures** — Maintained a generic merge proc (JS-based) that dynamically builds MERGE SQL from metadata
- **Data sharing** — Worked with cross-account shares (dev ↔ prod warehouses)
- **Information Schema & Account Usage** — For monitoring, auditing, and pipeline debugging

---

**Q: How do you approach performance optimization in Snowflake?**

A: 
1. **Clustering keys** — For large tables with predictable filter patterns (e.g., TRANS_MONTH on a 68M row table)
2. **Warehouse sizing** — Right-size for workload; use MEDIUM for batch ETL, SMALL for ad-hoc
3. **Pruning** — Structure queries so Snowflake can prune micro-partitions (filter on clustered columns early)
4. **Avoid SELECT *** — Especially in staging views with 100+ columns; columnar storage benefits from projection pushdown
5. **Materialized views** — For frequently-accessed aggregations that don't need real-time freshness
6. **Query profiling** — Use EXPLAIN and Query History to identify full table scans

---

## 4. FDE-Specific Scenarios

**Q: You're deployed at a customer site. Their ETL pipeline breaks at 2 AM and dashboards are stale by morning. What do you do?**

A: 
1. **Immediate:** Check task history, error logs, and recent changes. In Snowflake: `TASK_HISTORY()`, `QUERY_HISTORY()`, and the error log table.
2. **Diagnose:** Is it a data issue (bad source data), infrastructure issue (warehouse suspended), or code issue (schema change broke a query)?
3. **Fix or workaround:** If quick fix is possible, apply it. If not, run the pipeline manually while investigating the root cause.
4. **Communicate:** Send status update to stakeholders before they notice. "Dashboards will be refreshed by [time]. Root cause identified, permanent fix in progress."
5. **Prevent:** Add monitoring/alerting so next time the team knows before the business does.

---

**Q: A customer wants to add a new data source to their existing pipeline in 2 days. How do you approach this?**

A: 
1. **Understand the source:** Schema, volume, frequency, delivery mechanism (API, file drop, database link)
2. **Map to existing patterns:** Does it fit the existing generic-merge + control-table pattern? If yes, follow the template:
   - Create staging table (with IS_PROCESSED, LOAD_FLAG, LOAD_TIMESTAMP, _SEQ column)
   - Create target table
   - Create sequence object
   - Create staging view (if needed)
   - Insert a row into the control table
   - Create task
3. **Test with sample data** — Insert a few rows into staging, run the proc manually
4. **Deploy** — Enable the task, validate first run

The key is leveraging existing infrastructure rather than building from scratch.

---

**Q: How do you handle situations where the customer's request conflicts with engineering best practices?**

A: 
- **Listen first** — Understand the business need behind the request
- **Explain tradeoffs** — "We can do X quickly but it creates tech debt. Alternative Y takes a day longer but is maintainable."
- **Propose options** — Give 2-3 approaches with pros/cons
- **Respect their decision** — If they choose the quick path with full understanding of tradeoffs, execute it well
- **Document** — Note the decision and the tech debt for future cleanup

---

## 5. System Design

**Q: Design a real-time alerting system for data quality issues.**

A: 
- **Detection layer:** After each ETL run, execute validation queries (row count deltas, NULL rates, duplicate checks, freshness)
- **Threshold engine:** Compare current metrics against historical baselines. Alert on anomalies (e.g., row count grew 20% overnight = possible duplicate issue)
- **Notification:** Severity-based routing — P1 (data loss) → PagerDuty, P2 (duplicates) → Slack/email, P3 (minor) → daily digest
- **Self-healing:** For known patterns (like the reference-number duplicate), auto-trigger cleanup. For unknown, alert and wait for human decision.
- **Audit trail:** Log all alerts, actions taken, and resolutions for pattern analysis

---

**Q: How would you build a metadata-driven ETL framework?**

A: A metadata-driven pattern:
- **Control table**: Stores source view, target table, merge procedure name, unique key, last run timestamp, warehouse assignment
- **Generic procedures** (a merge proc, a CDC stream/sequence merge proc, etc.): Read metadata, dynamically build MERGE SQL, execute
- **Orchestration views**: One view per target table, used by the scheduler to determine what to run and when
- **Scheduling:** Snowflake Tasks with CRON schedules, grouped by warehouse/priority

Benefits: Add a new table by inserting one row into the control table + creating the objects. No code changes to the framework.

---

## 6. AI/GenAI & LLM Engineering

**Q: Describe an AI/GenAI solution you built end-to-end and deployed to production.**

A: I built a **multi-purpose enterprise AI chatbot platform** for an energy utility, serving thousands of employees:

!!! note "2026 update for this story"
    Claude 3.5 Sonnet (used below) was retired on the Anthropic API in October 2025, and
    LangChain's `create_sql_agent` / ReAct agent types are now legacy. Tell the story as
    built, then add what you'd do today: re-run the eval set on a current Claude model
    (via a Bedrock inference profile), move the SQL agent to LangChain 1.x `create_agent`
    or LangGraph, and expose tools through MCP.

- **Architecture:** React frontend → WebSocket API Gateway → FastAPI backend (Docker on ECS) → Amazon Bedrock (Claude 3.5 Sonnet) → DynamoDB for conversation persistence
- **LLM:** Claude 3.5 Sonnet via Amazon Bedrock, accessed through a VPC endpoint for security
- **Multiple AI capabilities in one platform:**
  - **Policy Q&A (RAG):** Uses a managed retrieval service (e.g. Amazon Kendra) to retrieve relevant policy documents, then Claude generates grounded answers with source citations
  - **SQL Agent:** LangChain `create_sql_agent` connected to Snowflake — users ask natural language questions, the agent generates and executes SQL, returns formatted answers
  - **IT Helpdesk Q&A:** Domain-specific knowledge base for IT support
  - **Document Chat:** Upload PDFs/DOCX/audio files, chat with their contents using Textract + LLM
  - **Custom Bot Builder:** Users create their own bots with custom instructions and knowledge bases
  - **Field-Crew Dispatch:** AI-assisted crew assignment during service outages
  - **Content Highlight & Campaign Assist:** LLM-powered content creation tools
- **Security:** Malicious prompt detection (guardrails), PII document handling, VPC-private Bedrock/DynamoDB access, SSM-managed credentials, enterprise SSO
- **Production features:** WebSocket streaming, conversation history, feedback loop, admin settings panel, prompt library, usage metrics/trends

I also built a **GenAI Procurement Audit Bot** — a batch processing system (EventBridge → Lambda → Bedrock) that runs a 9-point AI audit checklist on every new Purchase Order using Claude 3.5 Sonnet via LangChain, processing hundreds of POs daily in parallel.

---

**Q: How do you choose between different LLM approaches (fine-tuning vs prompting vs RAG)?**

A: Decision framework:
- **Prompt engineering first** — If the task can be solved with clear instructions + context in the prompt, do that. Cheapest to iterate on, no training data needed. This is what I used for the procurement audit — the 9-point checklist is entirely prompt-driven with structured output.
- **RAG (Retrieval Augmented Generation)** — When the LLM needs access to domain-specific knowledge that changes frequently (policies, contracts, internal docs). I used this for a document-retrieval bot — retrieves relevant documents then generates answers grounded in those sources.
- **Fine-tuning** — Only when you need consistent behavior that can't be achieved with prompting, or when you need to reduce token costs at scale. Rare in enterprise settings because it's expensive to maintain.

---

**Q: How do you handle LLM hallucinations in a production system?**

A: Multiple layers:
1. **Temperature 0** — For factual tasks (audit checks), I use temperature=0.0 to minimize variability (it reduces randomness; it doesn't guarantee correctness or identical outputs)
2. **Structured output** — Force the LLM to return Pass/Fail/NA with a reason. Constrained output space = fewer hallucinations
3. **Grounding** — Provide all relevant data in the prompt context (PO details, line items, attachments). The LLM evaluates what's there, not what it imagines
4. **Validation layer** — Post-process LLM output with rules (e.g., if amount field is $0 and LLM says "Pass" for amount check, override)
5. **Human-in-the-loop** — For high-stakes decisions, LLM flags issues but humans make the final call

---

**Q: How do you architect an LLM-powered application for enterprise security and compliance?**

A: Key decisions for an enterprise LLM platform:
- **Network isolation:** VPC-private Bedrock and DynamoDB access via VPC endpoints (stored in SSM). No LLM calls traverse the public internet.
- **Authentication:** Enterprise SSO → Amazon Cognito (JWT tokens). WAF with IP whitelisting for the corporate network only.
- **Authorization:** Role-based access via Cognito groups. Admin vs regular user capabilities.
- **Guardrails layer:** Before every LLM call, user input passes through malicious-prompt-check and data-guardrail functions that classify sensitivity (Public/Internal/Confidential/Restricted). Restricted prompts are blocked.
- **IAM least privilege:** Each Lambda has a scoped role — only the services it needs (Bedrock InvokeModel, specific DynamoDB tables, specific S3 buckets)
- **Audit trail:** Every conversation persisted in DynamoDB with user ID, timestamps, model used, and application context
- **Secrets management:** All credentials in SSM Parameter Store (Snowflake creds, Bedrock endpoints, retrieval index IDs) — never in code or env vars directly
- **Infrastructure as Code:** AWS CDK (TypeScript) — all security configs versioned and reviewable
- **CI/CD security:** Jenkins + CodeBuild pipeline with separate environments: sandbox → dev → test → prod (separate AWS accounts)

---

**Q: Explain your experience with RAG (Retrieval Augmented Generation).**

A: I built a **Policy Q&A feature** using RAG with a managed retrieval service (Amazon Kendra):
- **Document ingestion:** Policies, procedures, and regulatory documents indexed from an S3 bucket
- **Retrieval:** User query → retrieval service returns the top-N relevant document chunks
- **Context assembly:** Extract document titles and content from the results, build a context string
- **Generation:** Prompt template (stored in DynamoDB, dynamically loaded) + context + user query → Claude 3.5 Sonnet generates a grounded answer
- **Streaming response:** `invoke_model_with_response_stream` for real-time token streaming to the UI via WebSocket
- **Source attribution:** Automatically appends clickable source links from the retrieved documents. Maps S3 document URIs to their original web URLs via a lookup file
- **Challenges solved:**
  - Dynamic prompt templates stored in DynamoDB — updatable without redeployment
  - Multi-environment support (dev/test/prod) with environment-aware bucket and endpoint resolution
  - Source link resolution for documents that live in multiple locations

---

**Q: How do you evaluate LLM performance in production?**

A:
- **Task-specific metrics:** For the procurement audit, I measure precision/recall of Pass/Fail decisions against human auditor ground truth
- **Consistency:** Run the same PO through the system multiple times — with temperature=0, verdicts should match almost always (not guaranteed byte-identical); a flipping verdict marks an ambiguous prompt or borderline case
- **Edge cases:** Track cases where the LLM returns NA or unexpected outputs — these reveal prompt gaps
- **Cost monitoring:** Track token usage per PO, cost per audit. Optimize prompts to reduce tokens without losing accuracy
- **Latency:** P50/P95 response times. Our parallel processing (40 workers) keeps total batch time under 30 minutes for hundreds of POs
- **Drift detection:** Compare weekly LLM outputs against baseline — if accuracy drops, the model may have been updated or prompts need tuning. Pin model versions and re-run the ground-truth set before any model migration (model retirements force these on a schedule)

---

**Q: How do you handle prompt engineering at scale?**

A:
- **Template-driven:** Use PromptTemplate (LangChain) with variables for dynamic content. The audit checklist prompt is a template that receives PO data as variables.
- **Version control:** Store prompts as versioned files/templates alongside the code (not strings scattered through it) so every change is reviewed and tied to an eval run
- **Chain-of-thought:** For complex evaluations, I structure prompts to force step-by-step reasoning before the final verdict
- **Few-shot examples:** Include 2-3 examples of good Pass/Fail responses in the prompt to calibrate the model
- **Separation of concerns:** One prompt per audit check (9 separate LLM calls) rather than one mega-prompt. Easier to debug, iterate, and parallelize.

---

**Q: What's your experience with AI agents and tool use?**

A:
- Built a **LangChain SQL Agent** that connects to Snowflake via `SQLDatabaseToolkit`:
  - Users ask natural language questions about operational data (e.g. outage metrics)
  - Agent uses `ChatBedrock` (Claude 3.5 Sonnet) with `ZERO_SHOT_REACT_DESCRIPTION` agent type
  - Custom `SQLHandler` callback captures generated SQL for audit/display
  - Agent autonomously: inspects table schema → generates SQL → validates with `sql_db_query_checker` → executes → formats response
  - Security: read-only role, query tagging for monitoring
- Built an **MCP (Model Context Protocol) Snowflake agent** for personal productivity — gives an LLM tools to query databases, describe tables, search objects across the entire data warehouse
- Key design principles for production agents:
  - **Least privilege:** Agent uses read-only roles, cannot modify data
  - **Guard rails:** Malicious prompt detection before LLM processing, query tag tracking
  - **Observability:** Custom callback handlers capture every tool call and SQL generated
  - **Fallback:** If agent fails, return the partial SQL so users can refine manually

---

## 7. AI + Data Engineering Integration

**Q: How do you connect AI capabilities to existing data infrastructure?**

A: The procurement bot is a good example of AI layered on existing infrastructure:
- **Existing:** Snowflake data warehouse with purchase-order data from a procurement system (already being loaded via ETL)
- **AI layer:** Lambda reads from the same Snowflake tables, enriches with procurement-system API data, then sends to the LLM for analysis
- **Output feeds back into data platform:** Results stored in DynamoDB + S3 CSV, consumable by dashboards

The key is: AI doesn't replace the data pipeline — it augments it. The data engineering ensures clean, reliable input. The AI layer adds intelligence on top.

---

**Q: How would you deploy an LLM-powered feature for a customer in one week?**

A: Based on how these platform features were built:
- **Day 1-2:** Understand the use case. Stand up the backend route (FastAPI endpoint) + prompt template (stored in DynamoDB for runtime flexibility). Prototype with Claude in a notebook.
- **Day 3:** Build the full flow — WebSocket streaming for real-time token delivery, DynamoDB conversation persistence, S3 presigned URLs for document upload if needed.
- **Day 4:** Integration testing. Add guardrails (malicious prompt check). Connect to external data source (Snowflake, Kendra, SharePoint). Add to bot router so users can select it.
- **Day 5:** Deploy via CDK through Jenkins pipeline (dev → test → prod). Demo to stakeholders. Enable feature toggle in admin settings.

**Key architecture pattern I reuse for every new feature:**
```
User → WebSocket API GW → SNS (decouple) → Lambda (streaming) → Bedrock (Claude) 
                                                              → DynamoDB (persist)
                                                              → WebSocket (stream back)
```

This pattern supports streaming responses, conversation history, and graceful error handling out of the box. New features just plug in a new prompt + data source.

---

## 8. Behavioral / Leadership

**Q: Tell me about a time you had to push back on a proposed solution.**

A: When investigating the finance duplicates, the initial suggestion was to remove the reference number from the MERGE unique key. I analyzed the data and found hundreds of thousands of legitimate transaction groups that differ ONLY by that reference number — removing it would cause data collisions and loss. I presented the evidence and proposed the targeted DELETE instead. The team agreed.

---

**Q: How do you stay effective when working across multiple projects simultaneously?**

A: 
- **Context switching discipline:** I keep running notes per project so I can resume quickly
- **Automation:** Build monitoring and alerting so issues surface to me rather than requiring active checking
- **Templates:** Standardize common tasks (CR templates, investigation runbooks, fix scripts with backup/validate/rollback sections)
- **Prioritize ruthlessly:** If something isn't urgent and important, it goes on the backlog — not on today's plate
