---
icon: material/api
---

# FastAPI Interview Q&A — Senior & Scenario-Based

*Last reviewed: October 2026*

These questions target senior engineers who serve APIs and models with FastAPI in production. Expect interviewers to probe how the event loop really behaves, how you keep latency predictable under load, and how you debug the failures that only show up at scale.

## Core concepts

??? question "When should a FastAPI endpoint be 'async def' versus plain 'def', and what goes wrong if you choose badly?"
    **Short answer:** Use async def when everything inside awaits non-blocking I/O; use def for blocking work, because FastAPI runs sync endpoints in a threadpool so they do not stall the event loop.

    **In depth:** The classic failure is calling a blocking library (requests, a sync database driver, heavy CPU work) inside an async def. That call freezes the single event loop, so every other request on that worker waits, and p99 latency spikes while CPU looks idle. Sync def endpoints are safer for blocking code but are bounded by the threadpool size (around 40 threads by default in AnyIO), so a slow dependency can exhaust it. For CPU-heavy work, neither is right: push it to a process pool, a separate service, or a queue. Measure with event loop lag metrics or asyncio debug mode, which logs slow callbacks.

    **Follow-up they'll ask:** How do you call a blocking library from async code? Wrap it with run_in_threadpool or asyncio.to_thread, and cap concurrency with a semaphore.

??? question "How does FastAPI dependency injection work, and how do you use it well in a large codebase?"
    **Short answer:** Dependencies are callables declared with Depends; FastAPI resolves them per request, caches them within that request, and supports yield for setup and teardown.

    **In depth:** Good uses are database sessions, the authenticated principal, tenant context, feature flags and pagination parameters. Yield dependencies give you a clean place to commit or roll back and release connections. Keep dependencies thin and composable: a get_current_user that depends on a token parser, and a require_role that depends on get_current_user. Avoid hiding expensive network calls in dependencies that every route pulls in. Long-lived clients (HTTP clients, model handles) belong in the lifespan handler and app state, not created per request. The big testing win is app.dependency_overrides, which lets you swap real auth or databases for fakes without monkeypatching.

    **Follow-up they'll ask:** Are dependencies shared across requests? No, only cached within one request unless you set use_cache=False or store objects at app level.

??? question "What changed with Pydantic v2 and how do you use it for validation in an API?"
    **Short answer:** Pydantic v2 moved its core to Rust, making validation much faster, and changed APIs such as model_validate, model_dump, field_validator and ConfigDict.

    **In depth:** In an API, request models define the contract and response_model filters what leaves the service, which prevents leaking internal fields. Use strict types where coercion would hide bugs, constrained fields for lengths and ranges, and discriminated unions for polymorphic payloads, which validate faster and give clearer errors. Keep separate models for create, update and read rather than one model with many optional fields. For heavy payloads, validation cost is real, so measure it and consider TypeAdapter for non-model data. Migration pitfalls include changed defaults around coercion, renamed methods, and custom validators that relied on v1 behaviour.

    **Follow-up they'll ask:** How do you return a clean error for a validation failure? Customise the RequestValidationError handler to return a consistent error envelope without echoing sensitive input.

??? question "When is BackgroundTasks enough and when do you need a real queue?"
    **Short answer:** BackgroundTasks is fine for small, best-effort work after the response, such as sending a log or a non-critical email; anything that must survive restarts, retry or scale independently needs a queue.

    **In depth:** BackgroundTasks run in the same worker process after the response is sent. If the pod is killed during a deploy, the work is lost, there is no retry, no visibility and no backpressure, and heavy tasks steal capacity from request handling. A queue (Celery, RQ, Arq, SQS, Pub/Sub, Kafka) gives durability, retries with backoff, dead-letter handling and independent scaling of workers. For long jobs like document ingestion or batch inference, return 202 with a job id and expose a status endpoint or webhook. Make consumers idempotent because queues deliver at least once.

    **Follow-up they'll ask:** How do you avoid losing a job if the DB write succeeds but the enqueue fails? Use a transactional outbox and a relay that publishes from it.

??? question "How do you stream an LLM response from FastAPI without blocking other requests?"
    **Short answer:** Return a StreamingResponse (or an SSE response) backed by an async generator that awaits tokens from an async model client, so the event loop stays free between chunks.

    **In depth:** The generator must use an async client; a sync iterator over a blocking SDK will pin the loop. Server-Sent Events are the usual choice for browsers because they are simple, work over HTTP, and reconnect automatically. Set headers to disable proxy buffering (for example X-Accel-Buffering for nginx) and check that load balancers and ingress allow long-lived responses. Send periodic heartbeat comments so idle connections are not dropped. Detect client disconnects with request.is_disconnected or cancellation so you stop generating and stop paying for tokens. Emit structured events for errors mid-stream, since the status code has already been sent as 200.

    **Follow-up they'll ask:** SSE or WebSockets? SSE for one-way token streams; WebSockets when the client must send messages mid-session, such as interrupting or tool approvals.

??? question "How do you implement OAuth2 and JWT authentication in FastAPI correctly?"
    **Short answer:** Use the OAuth2 security utilities to extract a bearer token, validate it in a dependency against your identity provider's keys, and enforce scopes or roles per route.

    **In depth:** In production you usually do not issue tokens yourself; an IdP (Entra ID, Okta, Auth0, Cognito, Keycloak) issues them and your API validates them. Validation means checking signature against cached JWKS keys, issuer, audience, expiry and not-before, and pinning the allowed algorithms so 'none' or algorithm confusion attacks fail. Keep access tokens short-lived and rely on refresh tokens at the client. Put authorization (tenant, role, resource ownership) in dependencies so it is consistent and testable. For service-to-service calls, use client credentials or workload identity rather than shared API keys.

    **Follow-up they'll ask:** How do you revoke a JWT before it expires? Keep lifetimes short and, where needed, check a revocation list or session version in a fast store.

??? question "How do timeouts and cancellation work in an async FastAPI service?"
    **Short answer:** Every outbound call needs an explicit timeout, and the whole request needs a budget, because async code waits forever by default and slow dependencies cascade.

    **In depth:** Set connect and read timeouts on HTTP clients and database drivers, and wrap multi-step work with asyncio.timeout or anyio cancel scopes. Propagate a deadline so downstream calls get the remaining budget rather than a fresh full timeout. When a client disconnects, the handler can be cancelled; code must tolerate CancelledError, release resources in finally blocks and not swallow cancellation. Align timeouts across layers: client, load balancer, ingress, uvicorn and upstream LLM provider, otherwise the proxy closes the connection while your worker keeps burning tokens. Retries should only apply to idempotent operations, with jitter and a retry budget.

    **Follow-up they'll ask:** What happens if you catch CancelledError and continue? The task does not stop, leaking work and breaking shutdown; re-raise it after cleanup.

??? question "How do you size uvicorn and gunicorn workers for a FastAPI service?"
    **Short answer:** On Kubernetes, prefer one uvicorn process per container and scale with replicas; on VMs, gunicorn with uvicorn workers roughly matched to CPU cores is common.

    **In depth:** Each worker is a separate process with its own event loop and memory, so worker count multiplies RAM, which matters a lot when each worker loads a model. For I/O-bound async services, one worker can handle many concurrent requests, so more workers mainly help with CPU-bound parts. On Kubernetes, one process per pod keeps resource requests honest and lets the HPA and liveness probes work cleanly. Configure graceful shutdown timeouts longer than your longest normal request, and use max-requests with jitter if you have slow memory leaks. Load test to find the knee of the latency curve rather than guessing.

    **Follow-up they'll ask:** Why not run 8 workers per pod with a 2 GB model? Each worker copies the model, multiplying memory; serve the model in a separate server instead.

## Scenarios

??? question "Your FastAPI service's p99 latency jumps to seconds under load while CPU stays low — what do you do?"
    **Short answer:** Suspect a blocked event loop or an exhausted pool: something synchronous is running on the loop, or requests are queuing for DB connections or threadpool slots.

    **In depth:**
    - Check event loop lag metrics and enable asyncio debug to log slow callbacks.
    - Profile with py-spy dump on a live worker to see what is actually running.
    - Look for sync clients inside async def, such as requests, boto3 or a sync ORM.
    - Inspect DB pool wait time and threadpool saturation; low CPU with high latency usually means waiting, not computing.
    - Check downstream latency in traces to rule out a slow dependency.

    Fix by moving blocking calls to threads or async clients, sizing pools to match concurrency, and adding concurrency limits so overload fails fast instead of queuing.

    **Follow-up they'll ask:** How do you prevent it recurring? Add a CI lint rule for blocking calls in async code and alert on loop lag.

??? question "Your model-serving endpoint is slow and the GPU sits at 20 percent utilisation — how do you improve throughput?"
    **Short answer:** Add dynamic batching and separate the model server from the API layer, so requests are grouped into GPU-efficient batches instead of one forward pass per request.

    **In depth:** A FastAPI handler calling the model per request leaves the GPU idle between small calls. Dynamic batching collects requests for a few milliseconds or up to a batch size, then runs them together, trading a small latency increase for large throughput gains. For LLMs, use a dedicated inference server such as vLLM, TGI or Triton, which implements continuous batching and paged KV cache; FastAPI becomes a thin gateway for auth, validation and routing. Keep one model copy per GPU, warm it at startup, and expose readiness only after warm-up. Measure tokens per second, queue time and time to first token separately.

    **Follow-up they'll ask:** What is the trade-off in the batch window size? Larger windows raise throughput but add latency; tune against your p95 SLO.

??? question "How would you add rate limiting to a multi-tenant FastAPI API?"
    **Short answer:** Enforce limits per tenant and per key in a shared store like Redis using a token bucket or sliding window, ideally at the gateway, with the API enforcing finer business limits.

    **In depth:** In-process limiters break with multiple replicas because each pod counts separately. A Redis-backed token bucket with atomic Lua scripts gives consistent limits across pods. For LLM endpoints, limit tokens per minute and concurrent streams, not just requests, because one request can cost a hundred times another. Return 429 with Retry-After and rate limit headers so clients can back off. Decide on fail-open versus fail-closed if Redis is down: fail-open protects availability, fail-closed protects cost. Monitor rejections per tenant to spot both abuse and limits that are set too low.

    **Follow-up they'll ask:** Where should limits live, gateway or app? Coarse limits at the gateway, tenant and cost-aware limits in the app.

??? question "How do you make a FastAPI service observable in production?"
    **Short answer:** Emit structured logs, RED metrics and distributed traces with OpenTelemetry, all correlated by a request id and trace id.

    **In depth:** Instrument FastAPI, the HTTP client and the database driver with OpenTelemetry so traces show where time goes across services. Track rate, errors and duration per route, plus saturation signals: event loop lag, threadpool usage, DB pool waits and in-flight requests. For LLM endpoints add time to first token, tokens in and out, cost per request and model version. Logs should be JSON with tenant, route and trace id, and must redact PII and secrets. Use exemplars to jump from a latency spike to a trace. Define SLOs and alert on burn rate rather than raw thresholds.

    **Follow-up they'll ask:** How do you avoid high-cardinality metric explosions? Keep user ids and prompts out of metric labels; put them in traces or logs.

??? question "How do you test a FastAPI application thoroughly without a slow, flaky suite?"
    **Short answer:** Use a layered approach: fast unit tests on pure logic, API tests with the TestClient or httpx AsyncClient and dependency overrides, and a smaller set of integration tests against real dependencies in containers.

    **In depth:** Dependency overrides let you replace auth, the database session and external clients with fakes per test. Use httpx AsyncClient with ASGI transport for async tests so you exercise the real middleware and lifespan. Testcontainers gives real Postgres or Redis without shared environments. For LLM calls, record and replay responses or use a fake model, and keep a separate eval suite for quality. Add contract tests from the OpenAPI schema to catch breaking changes, and load tests with Locust or k6 for latency regressions before release.

    **Follow-up they'll ask:** How do you test streaming endpoints? Consume the stream in the test and assert on event order, final event and disconnect handling.

??? question "You need to make a breaking change to a public API used by many clients — how do you version and roll it out?"
    **Short answer:** Introduce a new version (usually a URL prefix such as v2 via separate routers), run both in parallel, communicate a deprecation timeline, and measure usage before removing the old one.

    **In depth:** Prefer additive changes so most updates need no new version: new optional fields, new endpoints. When a break is unavoidable, keep shared business logic and translate at the edge so v1 and v2 do not fork the codebase. Mark deprecated endpoints in OpenAPI, return Deprecation and Sunset headers, and track calls per client per version. Contract tests protect v1 while v2 evolves. Remove v1 only when traffic is near zero and key clients have confirmed migration.

    **Follow-up they'll ask:** URL versioning or header versioning? URL is more visible and cache-friendly; headers are cleaner but easier for clients to get wrong.

??? question "Your FastAPI pods get OOM-killed and restart loops start during traffic peaks on Kubernetes — what do you check?"
    **Short answer:** Check memory per worker, unbounded concurrency, large request or response bodies held in memory, and whether limits and probes are set realistically.

    **In depth:**
    - Compare actual memory under load to the container limit; multiple workers or model copies often explain it.
    - Look for unbounded concurrency: without limits, a burst creates thousands of in-flight requests each buffering data.
    - Stream large uploads and downloads instead of reading them fully.
    - Check for leaks with tracemalloc or memray on a staging pod.
    - Make liveness probes cheap and independent of downstreams, so a slow DB does not trigger restarts that worsen the outage.

    Add load shedding with a max in-flight limit returning 503, and scale on a meaningful signal such as in-flight requests.

    **Follow-up they'll ask:** Liveness versus readiness? Readiness removes a pod from traffic; liveness restarts it, so keep liveness minimal.

??? question "How do you design consistent error handling across a FastAPI service?"
    **Short answer:** Define one error envelope, raise typed domain exceptions in business code, and map them to HTTP responses in exception handlers rather than scattering HTTPException everywhere.

    **In depth:** A consistent envelope, such as RFC 9457 problem details with a type, title, detail and request id, makes client handling predictable. Map domain errors to status codes centrally: not found to 404, conflict to 409, quota to 429, upstream timeout to 504. Never leak stack traces, SQL or internal hostnames; log them with the trace id instead. Distinguish retryable from non-retryable errors so clients know when to back off. For streaming endpoints, define an error event format because headers are already sent.

    **Follow-up they'll ask:** How do you handle unexpected exceptions? A catch-all handler returns a generic 500 with the request id and logs the full error.
