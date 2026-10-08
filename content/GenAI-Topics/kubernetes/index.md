---
icon: material/kubernetes
---

# Kubernetes & Containers

*Last reviewed: October 2026*

!!! info "What's changed recently"
    - **Versions:** Kubernetes **1.37** shipped in August 2026. Upstream maintains roughly the three most recent
      minor releases, with about 14 months of patches each.
      Managed services (EKS/GKE/AKS) run on their own support calendars.
    - **Dynamic Resource Allocation (DRA) is GA** (1.34). Accelerators can be
      requested through `ResourceClaim`s with device attributes and sharing,
      beyond the simple `nvidia.com/gpu: 1` extended resource.
    - **In-place Pod resize is GA** (1.35). You can change CPU and memory requests
      and limits without restarting the Pod, which helps right-size slow-to-load
      model servers.
    - **Ingress NGINX is retired.** Best-effort maintenance ended in March 2026,
      with no further releases or security fixes. New designs should use
      **Gateway API**; the **Gateway API Inference Extension** adds model-aware
      routing for LLM serving.

How AI workloads actually run in production: containers for reproducibility,
Kubernetes for orchestration, and the extra concerns unique to **model serving
and GPU workloads**. This is the "where does the model live and how does it
scale" layer.

!!! abstract "Why it matters for AI"
    Self-hosted models and agent services run as containers, usually on
    Kubernetes. Interviewers probe it because AI adds twists classic web apps
    don't have: **GPUs, slow cold starts (model loading), large images, and
    bursty, expensive inference.**

---

## Containers (Docker)

A container packages code + dependencies into a reproducible image, "runs the
same on my machine and in prod."

```dockerfile
# Multi-stage build: keep the runtime image small
FROM python:3.12-slim AS build
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt --target /deps

FROM python:3.12-slim
WORKDIR /app
COPY --from=build /deps /usr/local/lib/python3.12/site-packages
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

- **Multi-stage builds** keep runtime images lean (build deps stay in the build
  stage) — matters a lot for AI images that can balloon with CUDA/torch.
- **Images** are versioned artifacts in a **registry** (ECR/GHCR); tag by commit
  SHA and promote the same image across environments.
- **Don't bake secrets or model weights** into the image; mount them.

---

## Kubernetes core objects

| Object | What it is | AI use |
|--------|-----------|--------|
| **Pod** | One or more co-located containers (smallest unit) | A model-server instance |
| **Deployment** | Manages replicas + rolling updates of stateless pods | The inference/API service |
| **Service** | Stable virtual IP/DNS load-balancing to pods | Front the model-server pods |
| **Ingress / Gateway API** | HTTP(S) routing from outside the cluster (Gateway API is the modern successor) | Expose the AI API/gateway; model-aware routing |
| **Namespace** | Logical isolation | Separate dev/prod or teams |
| **ConfigMap / Secret** | Config / sensitive values | Prompts/config; API keys (KMS-backed) |
| **HPA** | Horizontal Pod Autoscaler — scale replicas on metrics | Scale inference on load |
| **Job / CronJob** | Run-to-completion / scheduled | Batch inference, nightly re-index |
| **PersistentVolume** | Durable storage | Model weights, cache |

```yaml
# Deployment + resource requests/limits + probes (the essentials)
apiVersion: apps/v1
kind: Deployment
metadata: {name: model-server}
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: server
          image: registry/model-server:<sha>
          resources:
            requests: {cpu: "1", memory: "2Gi"}      # scheduling guarantee
            limits:   {cpu: "2", memory: "4Gi"}       # cap (OOMKill over memory)
          readinessProbe:                             # "ready to serve?"
            httpGet: {path: /ready, port: 8000}
            initialDelaySeconds: 30                   # model load takes time
          livenessProbe:                              # "still alive?"
            httpGet: {path: /healthz, port: 8000}
```

**Requests vs limits** (a favorite probe): requests drive **scheduling**
(guaranteed resources); limits **cap** usage (CPU throttled, memory over-limit →
**OOMKilled**). For model servers, set a generous **readiness `initialDelay`** —
loading weights takes tens of seconds, and an aggressive liveness probe will kill
a pod mid-load in a crash loop.

---

## Security in Kubernetes

- **RBAC + service accounts** — pods get least-privilege identities; don't run as
  cluster-admin.
- **Secrets** — KMS-backed, mounted (CSI driver / external secrets), never in the
  image or ConfigMap; enable etcd encryption at rest.
- **Namespaces + network policies** — isolate workloads; restrict pod-to-pod and
  egress (ties to [AI Security](../../AI-Security/index.md) egress control).
- **No ambient cloud creds** in tool-executing pods (agent sandboxing).

---

## AI workloads on Kubernetes

The parts that differ from a normal web service:

- **GPU scheduling** — request GPUs explicitly (`nvidia.com/gpu: 1` via the
  device plugin, or a DRA `ResourceClaim` for richer selection and sharing); GPUs
  are scarce and expensive, so bin-pack and don't over-request. Node pools/taints
  keep GPU nodes for GPU work. MIG and time-slicing let small models share a GPU.
- **Model loading / cold start** — weights take time + memory to load; use
  readiness probes, pre-pull large images, keep a warm pool, and avoid
  scale-to-zero for latency-sensitive inference.
- **Autoscaling** — HPA (or KEDA) on queue depth, in-flight requests, or KV-cache
  utilization rather than CPU; cluster autoscaler or Karpenter adds GPU nodes
  under load. Scaling GPU pods is slower and
  costlier than web pods, factor that into the SLO.
- **Batch inference** — `Job`/`CronJob` for throughput-oriented offline work;
  queue-fed workers scale out.
- **Right-sizing** — inference is memory/GPU-bound; set requests/limits from real
  profiles or one pod starves the node. In-place resize (GA in 1.35) lets you
  adjust CPU and memory without a restart.
- **Model-aware routing** — LLM requests vary hugely in cost, so plain
  round-robin balancing is a poor fit. Inference gateways (the Gateway API
  Inference Extension, or llm-d-style schedulers) route on queue length,
  KV-cache state, and LoRA adapter placement.

```yaml
# Requesting a GPU
resources:
  limits:
    nvidia.com/gpu: 1
```

!!! note "Managed vs self-managed inference"
    Many teams serve models via a **managed API** (Bedrock/OpenAI) and never touch
    GPUs on K8s — you only self-host on Kubernetes for control, data-residency, a
    custom/fine-tuned model, or fixed cost at steady high volume. Know *when* you'd
    take on the GPU-ops burden (see [LLMOps](../llmops/index.md)).

---

## Interview deep dive

### 60-second talking points

- **"Containers give reproducibility; Kubernetes gives orchestration + scaling."**
- **"AI twists: GPUs, slow model-load cold starts, huge images, bursty inference."**
- **"Requests schedule; limits cap. Generous readiness delay for model load."**

??? question "A model-server pod is in CrashLoopBackOff. How do you debug it?"
    `kubectl describe pod` (events: OOMKilled? failed probe? image pull?) and
    `kubectl logs --previous`. For model servers the classic cause is a **liveness
    probe firing during the slow weight-load** (raise `initialDelaySeconds` /
    use a startup probe) or **OOMKilled** because the model needs more memory than
    the limit. Fix the root cause; don't just bump restarts.

??? question "How do you autoscale an inference service, and why not just CPU?"
    HPA on the signal that reflects load, **GPU utilization or request/queue
    depth**, not CPU (inference is GPU/memory-bound; CPU stays low while the GPU
    saturates). Cluster autoscaler adds GPU nodes under sustained load. Account for
    slower, costlier GPU-pod scaling in the latency SLO (keep a warm pool).

??? question "Requests vs limits — what breaks if you omit each?"
    No **requests** → the scheduler can't guarantee resources, pods land on packed
    nodes and get starved/evicted. No **limits** → a noisy pod can consume the node
    (memory) or get CPU-throttled unpredictably; a memory spike OOM-kills neighbors.
    Set requests to typical usage, limits to a safe ceiling; watch throttling from
    limits set too tight.

??? question "When would you run models on K8s vs a managed API?"
    Managed API for speed and zero GPU-ops. Self-host on K8s when data can't
    egress, you need a custom/fine-tuned model, want fixed cost at steady high
    volume, or need latency/control the API can't give — accepting GPU scheduling,
    autoscaling, and cold-start ops as the cost.

### Pitfalls interviewers probe

- Aggressive liveness probe killing a pod during model load.
- Autoscaling on CPU for a GPU-bound service.
- Baking secrets/weights into the image.
- No resource requests/limits → starvation or OOM.
- Scale-to-zero on a latency-sensitive model (cold-start pain).
- Running tool-executing pods with broad cloud creds (security).

### Rapid-fire

| Q | A |
|---|---|
| Pod vs Deployment? | Pod = smallest unit; Deployment manages replicas + rollouts |
| Requests vs limits? | Schedule vs cap (throttle/OOM) |
| HPA scales on? | A load metric — for inference, GPU util / queue depth |
| Request a GPU? | `limits: {nvidia.com/gpu: 1}` (device plugin) or a DRA `ResourceClaim` |
| Ingress NGINX status? | Retired March 2026; move to Gateway API |
| CrashLoop top causes? | Failed probe, OOMKilled, bad config, startup crash |
| Secrets live where? | KMS-backed Secret, mounted — not the image |
| Batch inference? | Job / CronJob, queue-fed workers |
| Model cold start fix? | Readiness/startup probe + warm pool + pre-pulled image |

!!! note "Related"
    [LLMOps / Deployment](../llmops/index.md) ·
    [Reliability](../reliability/index.md) ·
    [AI Security](../../AI-Security/index.md) ·
    Practice: [DevOps Interview Q&A](../../Personal-SourceCode/DevOps_Interview_QA.md) ·
    [AWS Interview Q&A](../../Personal-SourceCode/AWS_Interview_QA.md)
