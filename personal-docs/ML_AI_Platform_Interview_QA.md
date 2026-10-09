---
icon: material/kubernetes
---

# ML / AI Platform Interview Q&A — Senior & Scenario-Based

*Last reviewed: October 2026*

Senior questions for engineers who build the platform other teams train, serve and monitor models on: Kubernetes for GPUs, model serving, registries and feature stores, MLOps delivery, cost control, multi-tenancy and incident response. Each answer leads with the short version, then the trade-offs and failure modes an interviewer will probe.

## Core concepts

??? question "How do you schedule GPU workloads on Kubernetes without wasting expensive capacity?"
    **Short answer:** Separate GPU node pools by accelerator type and workload class, use taints and tolerations so only GPU jobs land there, and add a queueing layer so batch jobs wait for capacity instead of fragmenting it.

    **In depth:**

    - Expose GPUs through the vendor device plugin and label nodes by GPU model and memory so jobs request what they actually need.
    - Taint GPU nodes so CPU-only pods never squat on them.
    - Use a batch queue such as Kueue or Volcano for gang scheduling, so a distributed training job gets all its pods or none.
    - Share small GPUs for light inference with MIG partitions or time-slicing, accepting weaker isolation with time-slicing.
    - Measure allocated versus actually used GPU (SM utilisation and memory), not just pod requests.

    **Follow-up they'll ask:** Why not just let the default scheduler handle it? Because it has no notion of gang scheduling or fair-share queues, so large jobs deadlock on partial allocations.

??? question "How do you design autoscaling for GPU inference services?"
    **Short answer:** Scale on a signal that reflects GPU saturation, such as queue depth, in-flight requests or tokens per second, not CPU, and plan for slow cold starts by keeping warm headroom.

    **In depth:** CPU utilisation is nearly meaningless for a GPU-bound server. Use KEDA or a custom metrics HPA on concurrency or pending requests per replica. Node provisioning for GPUs can take minutes and model loading adds more, so cold start can be several minutes for large models. Mitigations include a minimum replica floor during business hours, pre-pulled images, model weights cached on local NVMe or a shared volume, and a cluster autoscaler or Karpenter-style provisioner configured with GPU instance types. Scale down slowly to avoid thrashing. Track p95 latency during scale-up events as the real test.

    **Follow-up they'll ask:** Should you scale to zero? Only for low-traffic or internal models where a multi-minute first request is acceptable; never for user-facing paths.

??? question "What is continuous batching in LLM serving and why does it matter?"
    **Short answer:** Continuous batching adds and removes requests from the running batch at each decoding step instead of waiting for a whole batch to finish, which dramatically raises GPU throughput for variable-length generation.

    **In depth:** With static batching, short requests wait for the longest one in the batch, and the GPU idles. Engines like vLLM combine continuous batching with paged KV-cache management, so memory is allocated in blocks rather than reserved for the maximum sequence length. That lets more concurrent sequences fit. The trade-off is that higher batch sizes improve throughput but increase per-token latency, so you tune max concurrent sequences against time-to-first-token and inter-token latency targets. Prefix caching helps when many prompts share a system prompt. Measure tokens per second per GPU and p95 TTFT together.

    **Follow-up they'll ask:** What fills up first under load? Usually KV-cache memory, causing preemption or queueing, not raw compute.

??? question "How do you think about the latency versus throughput trade-off when serving models?"
    **Short answer:** Decide per use case which SLO is binding, then tune batch size, concurrency, hardware and model size to meet it at the lowest cost per request.

    **In depth:**

    - Interactive chat cares about time-to-first-token and smooth streaming; batch scoring cares about cost per million tokens or rows.
    - Bigger batches raise throughput but add queueing delay; set a max wait time for dynamic batching.
    - Quantisation, smaller distilled models and speculative decoding reduce latency, with some quality risk that must be evaluated.
    - Separate pools for interactive and offline traffic stop batch jobs from hurting user latency.
    - Load test with realistic prompt and output length distributions, not fixed lengths.

    **Follow-up they'll ask:** How do you pick hardware? Benchmark cost per unit of work at your SLO on two or three instance types rather than trusting peak specs.

??? question "What should a model registry provide beyond storing model files?"
    **Short answer:** A registry is the system of record for which model version is approved for which environment, with lineage back to code, data and evaluation results.

    **In depth:** At minimum it should store immutable versioned artefacts with a content hash, the training code commit, dataset version or snapshot, hyperparameters, evaluation metrics and the environment or container used. It should support stage or alias transitions such as candidate, staging and production, with approvals and an audit trail. Deployment tooling should resolve models by alias from the registry rather than by file path, so rollback is just moving an alias. Model cards, licence information and risk classification belong here too, especially under emerging AI regulation. The failure mode to avoid is teams bypassing the registry by copying weights to a bucket.

    **Follow-up they'll ask:** How do you handle third-party foundation models? Register them too, pinned to an exact provider version, with your own evaluation results attached.

??? question "When is a feature store worth it, and what problems does it actually solve?"
    **Short answer:** It is worth it when multiple models reuse features and you need online serving with point-in-time correct training data; otherwise it is overhead.

    **In depth:** The core problems are training-serving skew, where features are computed differently offline and online, and leakage, where training uses values that were not known at prediction time. A feature store provides shared definitions, an offline store for point-in-time joins and an online low-latency store kept in sync. Costs include another system to operate, freshness pipelines and governance of ownership. For a single model with batch scoring, a well-tested dbt or Spark table is often enough. Measure value by reuse count, reduction in skew incidents and time for a new model to reach production.

    **Follow-up they'll ask:** How do you detect skew? Log the features used at serving time and compare their distributions with the offline values for the same entities.

??? question "How do you structure training pipelines and orchestration for reproducibility?"
    **Short answer:** Make every step a containerised, versioned task with explicit inputs and outputs, orchestrated by a DAG tool, so any model can be rebuilt from a commit plus a data snapshot.

    **In depth:**

    - Steps: data extraction, validation, feature build, training, evaluation, registration.
    - Pin container images and dependencies; record seeds, though accept GPU non-determinism for some ops.
    - Use data versioning or table snapshots or time travel so inputs are addressable.
    - Orchestrators such as Airflow, Kubeflow Pipelines, Argo or a managed equivalent all work; pick based on team skills and whether you need Kubernetes-native GPU steps.
    - Cache expensive steps by input hash, and checkpoint long training to survive spot preemption.

    **Follow-up they'll ask:** How do you prove reproducibility? Periodically retrain a past version and check metrics land within an agreed tolerance.

??? question "What does CI/CD look like for models compared with normal services?"
    **Short answer:** You still test code, but you also gate on data validation and model evaluation, and a model version can change without any code change.

    **In depth:** CI runs unit tests on feature and preprocessing code, schema checks and a small smoke training run. A training pipeline produces a candidate that must pass an evaluation gate: offline metrics against a fixed holdout, slice metrics for key segments, fairness or safety checks, and latency and memory benchmarks on target hardware. For LLM systems, the gate includes a regression eval set and LLM-as-judge or human-reviewed scoring. Promotion to production goes through the registry with an approval, then a progressive rollout. Keep the serving container and the model artefact versioned separately but deployed as a known pair.

    **Follow-up they'll ask:** Who approves? Automated gates for routine retrains, human sign-off for new architectures or high-risk use cases.

??? question "How do you monitor a production model for drift and quality decay?"
    **Short answer:** Monitor four layers: service health, input data drift, prediction drift and, where labels arrive, actual quality, with alerts tied to business impact.

    **In depth:**

    - Service: latency, errors, saturation, GPU memory.
    - Inputs: schema violations, null rates, distribution shift using PSI or similar per key feature.
    - Outputs: prediction distribution, confidence, refusal or fallback rates for LLMs.
    - Quality: delayed labels joined back, or sampled human review and automated evals for generative output.
    - Drift alone is not an incident; alert when drift correlates with a metric that matters, or route it to a retraining review.

    **Follow-up they'll ask:** What if labels take months? Use proxy metrics and a small human-labelled sample on a fixed cadence until true labels land.

??? question "How do you implement multi-tenancy and quotas on a shared ML platform?"
    **Short answer:** Isolate tenants by namespace with resource quotas, priority classes and fair-share queues, and pair hard limits with cost visibility so teams self-regulate.

    **In depth:** Each team gets namespaces, RBAC, network policies and a GPU quota. A queueing system lets teams borrow idle quota from others with preemption when the owner needs it back, which keeps utilisation high without starving anyone. Priority classes protect production inference over experiments. For shared inference endpoints, enforce per-tenant rate limits and token budgets at the gateway. Stronger isolation, such as separate clusters or node pools, is justified for regulated data or noisy workloads. Showback dashboards per team are often more effective than strict caps.

    **Follow-up they'll ask:** What is the main risk of borrowing? Preempted jobs losing work, so require checkpointing for anything that runs on borrowed capacity.

??? question "How do you use Terraform and infrastructure as code for an ML platform?"
    **Short answer:** Define clusters, node pools, networking, storage and IAM as versioned modules with plan review in CI, and keep fast-changing application deployment in a GitOps tool rather than Terraform.

    **In depth:** Terraform suits slow-moving foundations: VPCs, Kubernetes clusters, GPU node groups, buckets, registries and identity. Publish opinionated modules so a new team environment is a few lines of config. Use remote state with locking, split state by blast radius such as network, cluster and team, and run policy checks like OPA or Sentinel in the pipeline. Workloads, model deployments and Helm releases are better managed by Argo CD or Flux, which reconcile continuously. Detect drift with scheduled plans. The failure mode is one giant state file that everyone fears to apply.

    **Follow-up they'll ask:** How do you handle secrets? Never in state or variables in plain text; reference a secrets manager and inject at runtime.

??? question "What is a golden path on an ML platform and how do you measure developer experience?"
    **Short answer:** A golden path is the supported, paved way to go from notebook to monitored production model with minimal decisions, and you measure it by time-to-first-deploy and adoption.

    **In depth:**

    - Provide templates for training jobs and serving services with logging, metrics, tracing, registry integration and alerts built in.
    - Offer a CLI or portal such as Backstage to scaffold projects and request GPUs.
    - Keep escape hatches for advanced teams but make them own the extra operations.
    - Metrics: time from new project to first production deploy, percentage of models on the golden path, deploy frequency, support tickets per team and developer satisfaction surveys.
    - Treat the platform as a product with a roadmap driven by user interviews.

    **Follow-up they'll ask:** What if a team refuses to adopt it? Find out why; usually the path is missing a capability, and that is roadmap input.

## Scenarios

??? question "Your GPU bill has doubled in a quarter. How do you bring it under control?"
    **Short answer:** First get attribution so you know who and what is spending, then remove idle capacity, right-size serving, and use cheaper capacity for interruptible work.

    **In depth:**

    - Tag and label everything so cost maps to team, model and environment; publish showback.
    - Find idle waste: notebooks holding GPUs overnight, over-provisioned replica floors, dev endpoints left running. Add idle timeouts.
    - Right-size: measure real GPU utilisation; consolidate small models with MIG or multi-model serving; quantise where evals allow.
    - Use spot or preemptible capacity for checkpointed training and batch inference.
    - Commit to reserved or committed-use capacity only for the stable baseline.
    - Route simple LLM requests to smaller models and cache repeated responses.

    **Follow-up they'll ask:** How do you prove savings did not hurt quality? Track cost per request alongside latency SLOs and eval scores before and after each change.

??? question "A team wants to replace a production model with a new version. How do you roll it out safely?"
    **Short answer:** Shadow first to compare outputs and latency on real traffic, then canary a small percentage with automatic rollback on guardrail metrics, then ramp.

    **In depth:** In shadow mode the new model receives mirrored traffic but its responses are discarded, which tests latency, errors and output distribution with no user risk. Then canary at a few percent, comparing error rate, latency, business KPIs and, for LLMs, eval scores and user feedback per variant. Define rollback criteria before starting and automate them with a tool such as Argo Rollouts or a service mesh. Because model changes can harm only certain segments, check slice metrics, not just the average. Keep the old version warm until the ramp completes so rollback is instant.

    **Follow-up they'll ask:** When would you A/B test instead? When the question is business impact, which needs statistically powered comparison over days, not just safety.

??? question "At 2 a.m. latency on the main LLM inference service spikes and requests time out. Walk me through your response."
    **Short answer:** Stabilise first, diagnose second: declare an incident, protect users with shedding or fallback, then find what changed using metrics and recent deploys.

    **In depth:**

    - Declare severity, open a channel, assign an incident commander and a communicator.
    - Check what changed: model or config deploy, traffic surge, a node pool event, a noisy tenant.
    - Look at queue depth, KV-cache utilisation, GPU memory, preemptions and replica count. A traffic spike with slow GPU provisioning is a common cause.
    - Mitigate: roll back the last change, enable rate limiting per tenant, fall back to a smaller model or a provider endpoint, cap max output tokens.
    - Communicate status on a fixed cadence.
    - Afterwards run a blameless postmortem with action items such as warm headroom or admission control.

    **Follow-up they'll ask:** What would you add to prevent it? Load-based admission control and alerting on queue depth before latency breaches the SLO.

??? question "Several teams each built their own serving stack. How would you consolidate onto one platform?"
    **Short answer:** Understand why they diverged, build a platform that covers the common 80 percent better than their stacks, migrate a willing lighthouse team, and let results drive adoption.

    **In depth:** Start with an inventory: frameworks, latency needs, traffic, cost and on-call burden of each stack. Usually the shared needs are model loading, autoscaling, observability, auth and rollouts, while differences are in runtimes. Offer a standard serving layer that supports several runtimes, such as a vLLM-based path for LLMs and a general model server for classical models, behind one deployment interface. Migrate one team end to end and publish the before and after: reduced on-call load, cost and time to deploy. Set a deprecation timeline for unsupported stacks with leadership backing, but fund migration help rather than issuing a mandate alone.

    **Follow-up they'll ask:** What if one team has truly unique needs? Allow an exception with clear ownership, and revisit when the platform can absorb it.
