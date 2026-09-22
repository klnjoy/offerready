---
icon: material/aws
---

# AWS Interview Q&A — Advanced & Scenario-Based

Senior AWS for data/AI engineering: compute choices, serverless data pipelines,
IAM/security, networking for private inference, and cost. Study at a glance,
then open each question for depth.

!!! tip "How to use this page"
    Skim the **60-second talking points** and **rapid-fire** for recall, then
    drill into the collapsible questions. Finish with the **self-quiz**.
    Related: [DevOps Interview Q&A](DevOps_Interview_QA.md) ·
    [Data Engineering Interview Q&A](DataEngineering_Interview_QA.md).

---

## Study checklist

Can you explain each without notes?

- [ ] Lambda vs Fargate vs EC2 — when each
- [ ] S3 storage classes and lifecycle
- [ ] IAM roles vs users vs policies; least privilege
- [ ] VPC endpoints and why private inference needs them
- [ ] A serverless event-driven data pipeline (S3→Lambda→...)
- [ ] SQS vs SNS vs EventBridge vs Kinesis
- [ ] Secrets Manager vs Parameter Store
- [ ] Bedrock access patterns (private, guardrails)
- [ ] The Lambda 15-min / API Gateway 29-sec limits and workarounds
- [ ] Cost levers across compute/storage/egress

---

## 60-second talking points

- **"Pick compute by runtime shape."** Short/bursty/event-driven → Lambda;
  long-running/containerized → Fargate; full control/special hardware → EC2.
- **"Least privilege via roles, never long-lived keys."** Services assume roles;
  humans use SSO/short-lived creds.
- **"Keep data in-boundary with VPC endpoints."** Reach S3/Bedrock/DynamoDB
  privately, no public internet path.

---

## Core concepts — simple, then the nuance

??? note "Compute choice: explain it simply, then go deep"
    **Simple:** Lambda = run a function on an event, no servers. Fargate = run a
    container without managing servers. EC2 = you manage the VM.

    **The nuance:** Lambda fits event-driven, spiky, short (≤15 min) work with
    per-ms billing and instant scale — but cold starts, no long jobs, and package
    size limits. Fargate fits long-running services / big containers / steady load
    without cluster management. EC2 when you need GPUs, custom kernels, or full OS
    control. The decision is runtime duration, packaging, hardware, and how spiky
    the load is.

??? note "IAM: simple, then deep"
    **Simple:** A **role** is a set of permissions a service or user can *assume*
    temporarily; a **policy** is the JSON that grants specific actions on specific
    resources.

    **The nuance:** Prefer **roles** (assumed, short-lived credentials) over IAM
    users with static keys. Follow least privilege: scope actions and resource ARNs,
    use conditions, and separate roles per workload. Resource policies (e.g. S3
    bucket policy) grant cross-account/other-principal access. Trust policies define
    *who* can assume a role. Avoid `*:*`.

---

## Compute & serverless pipelines

=== "Event-driven pipeline"

    ```text
    S3 (file lands) → EventBridge/S3 event → Lambda (validate/route)
      → SQS (1 msg per unit, retry-safe)
      → Lambda / Fargate (process) → S3 + DynamoDB/warehouse
    dead-letter queue for poison messages; CloudWatch for logs/metrics
    ```

=== "Private inference path"

    ```text
    Lambda/Fargate (in VPC, private subnet)
      → VPC endpoint → Bedrock / S3 / DynamoDB   (no internet gateway)
    secrets in Secrets Manager; config in Parameter Store
    ```

!!! example "Worked scenario: nightly bulk job that calls an LLM per record"
    **Task:** Each night, process thousands of records, calling an LLM per record.

    **Reasoning:**
    1. **Trigger:** EventBridge cron.
    2. **Fan-out:** a dispatcher Lambda enqueues one **SQS** message per record →
       parallel, retry-safe, idempotent per unit.
    3. **Worker:** Lambda (or Fargate if per-item work is long or the container is
       heavy) reads the queue and calls **Bedrock via a VPC endpoint**.
    4. **Store:** results to S3 + DynamoDB; **DLQ** for failures.
    5. **Guardrails:** timeouts, retries with backoff, CloudWatch alarms.

    **Talking point:** "Queue-based fan-out keeps workers simple, parallel, and
    retry-safe — and the VPC endpoint keeps data off the public internet." (This is
    the pattern in the [procurement architecture](genai-procurement-architecture.md).)

??? question "Lambda vs Fargate vs EC2 — how do you choose?"
    **Lambda**: event-driven, spiky, short (≤15 min), per-ms billing, instant scale;
    watch cold starts and package limits. **Fargate**: long-running or containerized
    workloads, steady load, no server management. **EC2**: need GPUs, custom
    OS/kernel, or maximum control. Decide on duration, packaging, hardware, and load
    shape.

??? question "How do you handle Lambda's timeout limits for long LLM responses?"
    Lambda caps at 15 min and **API Gateway REST** at ~29s. For long/streaming LLM
    responses, use **WebSocket API Gateway** and stream tokens as they generate
    (Lambda posts chunks to the connection), or move to **Fargate** for genuinely
    long jobs, or **async** patterns (enqueue, process, notify). Don't hold a
    synchronous HTTP request open past the limit.

??? question "SQS vs SNS vs EventBridge vs Kinesis?"
    **SQS**: point-to-point queue, one consumer group, great for retry-safe fan-out
    work. **SNS**: pub/sub fan-out to many subscribers. **EventBridge**: event bus
    with routing rules/schedules, SaaS + AWS event integration. **Kinesis**: ordered,
    replayable streaming for high-throughput real-time data. Batch work → SQS;
    broadcast → SNS; routing/schedules → EventBridge; streaming analytics → Kinesis.

---

## Storage & data

??? question "S3 storage classes and lifecycle — how do you optimize cost?"
    Hot data → **S3 Standard**; infrequent → **Standard-IA**; archival →
    **Glacier / Deep Archive**; unknown/variable access → **Intelligent-Tiering**
    (auto-moves). Use **lifecycle rules** to transition/expire objects by age.
    Compress and use columnar formats (Parquet) to cut storage and query scan cost.
    Watch **egress** — cross-region/internet transfer is a common surprise bill.

??? question "Secrets Manager vs Parameter Store?"
    **Secrets Manager**: secrets with **rotation**, cross-account, higher cost —
    for DB creds, API keys needing rotation. **Parameter Store (SSM)**: config +
    secrets (SecureString), cheaper/simpler, no built-in rotation — for general
    config and less-sensitive values. Use Secrets Manager when rotation/lifecycle
    matters; Parameter Store for the rest.

??? question "How do you keep data in-boundary for private inference (e.g. Bedrock)?"
    Run compute in a **VPC** (private subnets) and reach AWS services through **VPC
    endpoints** (interface endpoints for Bedrock/DynamoDB, gateway endpoint for S3),
    so traffic never traverses the public internet. Put config in Parameter Store,
    secrets in Secrets Manager, and scope IAM roles least-privilege. This is the
    "no data egress" story enterprises need.

---

## Security & networking

??? question "Explain least privilege in AWS concretely."
    Grant only the actions needed on only the resource ARNs needed, per workload
    **role** (not shared, not `*`). Use **conditions** (source VPC, tag, MFA), avoid
    long-lived IAM user keys (prefer assumed roles / SSO / short-lived creds), and
    separate roles per environment. Review with Access Analyzer; deny by default.

??? question "Public subnet vs private subnet vs NAT?"
    **Public subnet**: has a route to an Internet Gateway (for load balancers,
    bastions). **Private subnet**: no direct internet route (for app/data tiers).
    A **NAT gateway** lets private resources make *outbound* internet calls without
    being reachable inbound. For AWS-service access, prefer **VPC endpoints** over
    NAT to stay on the AWS network and cut cost.

---

## Rapid-fire

| Q | A |
|---|---|
| Lambda max timeout? | 15 minutes |
| API Gateway REST timeout? | ~29 seconds (use WebSocket for streaming) |
| Role vs user? | role = assumed short-lived; user = long-lived identity |
| S3 for unknown access pattern? | Intelligent-Tiering |
| Retry-safe fan-out? | SQS (one message per unit) |
| Pub/sub broadcast? | SNS |
| Event routing/schedules? | EventBridge |
| Real-time ordered stream? | Kinesis |
| Rotate DB creds? | Secrets Manager |
| Private AWS-service access? | VPC endpoints |

---

## Pitfalls interviewers probe

- Using long-lived IAM user keys instead of roles.
- `Action: *` / `Resource: *` policies.
- Holding a synchronous request open past API Gateway/Lambda limits.
- Forgetting egress cost (cross-region/internet).
- NAT gateway where a cheaper VPC endpoint would do.
- No DLQ → poison messages silently lost or looping.

---

## Self-quiz

1. Choose compute for: a spiky event handler, a 40-min batch, a GPU job.
2. Design a nightly per-record LLM pipeline on AWS.
3. How do you stream a long LLM response past the API Gateway limit?
4. SQS vs SNS vs EventBridge vs Kinesis — one scenario each.
5. Keep Bedrock data in-boundary — what do you set up?
6. Secrets Manager vs Parameter Store — pick per case.
7. Explain least privilege with a concrete policy shape.
8. Cut cost on a storage- and egress-heavy workload.

## Further reading

- [AWS Well-Architected Framework](https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html)
- [IAM best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [Amazon Bedrock — User Guide](https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-bedrock.html)

!!! note "Cross-links"
    Related: [DevOps Interview Q&A](DevOps_Interview_QA.md) ·
    [Data Engineering Interview Q&A](DataEngineering_Interview_QA.md)
