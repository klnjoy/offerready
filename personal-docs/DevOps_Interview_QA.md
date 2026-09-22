---
icon: material/infinity
---

# DevOps Interview Q&A — Advanced & Scenario-Based

Senior DevOps / platform questions: CI/CD design, IaC, containers and
Kubernetes, observability, incident response, and cloud deployment patterns.
Study at a glance, then open each question for depth.

!!! tip "How to use this page"
    Skim the **60-second talking points** and **rapid-fire** for recall, then
    drill into the collapsible questions. Finish with the **self-quiz**.
    Related: [AWS Interview Q&A](AWS_Interview_QA.md).

---

## Study checklist

Can you explain each without notes?

- [ ] "Build once, promote the artifact" and why
- [ ] Externalized config to avoid drift
- [ ] Blue/green vs canary vs rolling
- [ ] IaC plan/apply, state locking, drift
- [ ] Requests vs limits in Kubernetes
- [ ] Debugging CrashLoopBackOff
- [ ] Secrets management done right
- [ ] The three pillars of observability
- [ ] SLI / SLO / error budget
- [ ] Incident response order (restore first)

---

## 60-second talking points

- **"Everything as code, everything reproducible."** Infra, pipelines, and config
  in version control so environments are rebuildable, not hand-crafted.
- **"Immutable deployments beat in-place mutation."** Build an artifact once,
  promote the *same* artifact through environments.
- **"Automate the path to prod, gate it with checks."** Fast CI feedback,
  controlled promotion with approvals and rollbacks.

---

## Core concepts — simple, then the nuance

??? note "Build once, promote: explain it simply, then go deep"
    **Simple:** Build the artifact (container image) **one time**, then move that
    exact same image through dev → test → prod. Don't rebuild per environment.

    **The nuance:** Rebuilding per environment risks a different artifact reaching
    prod than you tested (different base image, dependency versions, build flags).
    Promotion means the tested bits are the shipped bits. Environment differences
    live in **externalized config** (env vars, parameter store, secrets manager),
    never baked into the image.

??? note "SLI/SLO/error budget: simple, then deep"
    **Simple:** SLI = a number you measure (e.g. % successful requests). SLO = the
    target for it (99.9%). Error budget = how much you're allowed to miss (0.1%).

    **The nuance:** The error budget turns reliability into a shared decision: budget
    healthy → ship features fast; budget burning → stop and fix reliability. It
    aligns dev and ops on data instead of opinion, and it's why you alert on **SLO
    burn** (symptoms users feel) rather than every low-level metric.

---

## CI/CD

=== "Build once, promote"

    ```text
    PR:     lint → unit tests → security scan → build
    main:   build immutable image (tag = commit SHA) → push registry
            → deploy dev → integration/smoke tests
            → promote SAME image → test → (approval) → prod (canary/blue-green)
    ```

=== "Externalize config"

    ```text
    image  = same everywhere (tested artifact)
    config = per-env: env vars / parameter store / secrets manager
    infra  = same IaC templates, per-env variables
    ```

!!! example "Worked scenario: a deploy broke prod"
    **Symptom:** New release deployed, error rate spikes, users affected.

    **Reasoning / order of operations:**
    1. **Restore service first** — roll back to the last-good artifact / flip
       blue-green. Confirm recovery on dashboards. Don't debug a burning prod.
    2. **Then investigate** with logs/traces/metrics around the change window.
    3. **Prevent recurrence:** smaller/more frequent deploys, **canary** with
       automated rollback on error-rate/latency thresholds, better pre-prod tests,
       **feature flags** to decouple deploy from release.
    4. **Blameless postmortem** to fix the systemic gap, not the person.

    **Outcome:** "Rollback first, investigate second. Then make the next deploy safer
    with canary + flags."

??? question "Design a CI/CD pipeline for a containerized service."
    On PR: lint, unit tests, security scan, build. On merge: build an **immutable
    image tagged by commit SHA**, push, deploy dev, run integration/smoke tests,
    then **promote the same image** to test and prod behind approvals. Prod uses a
    safe strategy (blue/green or canary) with health checks and one-command
    rollback. Never rebuild per environment — promote the tested artifact.

??? question "How do you promote across environments without config drift?"
    Same artifact, **externalized config** per environment (env vars, parameter
    store, secrets manager) — never baked into the image. Infra as code applied per
    environment from the same templates. Branch/tag strategy controls eligibility so
    promotion is deterministic.

??? question "A deploy broke prod. Walk me through response and prevention."
    Response: **roll back first** (redeploy last-good / flip blue-green), confirm
    recovery, then investigate. Prevention: smaller/frequent deploys, canary with
    automated rollback, better pre-prod coverage, feature flags to decouple deploy
    from release, and a blameless postmortem.

??? question "Feature flags vs deploying — why decouple them?"
    Deploying ships code; a **feature flag** controls whether it's *active*. Decoupling
    lets you deploy dark, enable for a % of users, roll back a feature instantly
    without a redeploy, and test in prod safely. It shrinks blast radius and
    separates "is it deployed" from "is it on."

---

## Infrastructure as Code

??? question "How do you keep IaC safe and reviewable?"
    **Plan before apply** (review the diff in PR), remote **state** with locking to
    prevent concurrent corruption, modularize for reuse, pin provider/module
    versions, separate state per environment, gate prod `apply` behind approval, and
    detect **drift** on a schedule. Never edit cloud resources by hand outside IaC.

??? question "Someone changed a resource in the console and IaC wants to revert it. What happened?"
    **Drift**: live state no longer matches code, so the next plan proposes to
    reconcile (often destructively). Fix: import the manual change into code, or
    revert the console change, then re-plan. Prevent it by locking down console write
    access in prod and requiring changes through IaC + PR.

??? question "Blue/green vs canary vs rolling — trade-offs?"
    **Rolling**: replace instances gradually; simple, but mixed versions during
    rollout and slower rollback. **Blue/green**: full standby env, instant switch and
    rollback, but double resources briefly. **Canary**: route a small % to the new
    version, watch metrics, ramp or abort; safest but needs good routing + metrics.
    Choose by risk tolerance and infra cost.

??? question "How do you manage state for a team so two applies don't collide?"
    Remote backend with **state locking** (e.g. an object store + lock table), so a
    second apply waits or fails fast instead of corrupting state. Separate state per
    environment/component to shrink blast radius, restrict who can apply to prod, and
    never store state locally for shared infra.

---

## Containers & Kubernetes

=== "Right-size and self-heal"

    ```yaml
    resources:
      requests: {cpu: "250m", memory: "256Mi"}  # scheduling guarantee
      limits:   {cpu: "500m", memory: "512Mi"}  # cap (throttle / OOMKill)
    livenessProbe:  {httpGet: {path: /healthz, port: 8080},
                     initialDelaySeconds: 15, periodSeconds: 10}
    readinessProbe: {httpGet: {path: /ready,   port: 8080}}
    ```

=== "Debug a bad pod"

    ```bash
    kubectl describe pod <p>        # events: OOMKilled? probe fail? image pull?
    kubectl logs <p> --previous     # logs from the crashed container
    kubectl get events --sort-by=.lastTimestamp
    ```

??? question "A pod keeps restarting (CrashLoopBackOff). How do you debug?"
    `kubectl describe pod` (events: OOMKilled? failed probe? image pull?),
    `kubectl logs --previous` for the crashed container. Common causes: failing
    **liveness probe** (too aggressive timing), **OOMKilled** (memory limit too low),
    missing config/secret, or a real startup crash. Fix the root cause — adjust probe
    timing, raise limits, supply config — don't just bump restarts.

??? question "Requests vs limits — why do both matter?"
    **Requests** drive scheduling (guaranteed resources, bin-packing). **Limits** cap
    usage (CPU throttled; memory over-limit → OOMKilled). Set requests to typical
    usage, limits to a safe ceiling. No requests → poor scheduling; no limits → noisy
    neighbor starves the node. Watch for CPU throttling from tight limits.

??? question "How do you manage secrets in Kubernetes properly?"
    Don't commit secrets or bake them into images. Use a secrets manager (cloud
    KMS-backed) via an operator/CSI driver to mount them, or sealed/encrypted secrets
    in Git. Enable etcd encryption at rest, scope RBAC so pods read only what they
    need, and rotate regularly.

??? question "Liveness vs readiness probe — what's the difference?"
    **Liveness** = "is the app alive?" — fail → restart the container. **Readiness** =
    "can it serve traffic now?" — fail → remove from the load balancer but don't
    restart. Aggressive liveness timing causes false restarts; readiness handles slow
    startup and transient unavailability gracefully.

---

## Observability & reliability

??? question "What do you monitor, and how do you avoid alert fatigue?"
    Three pillars: **metrics** (RED/USE — rate, errors, latency, saturation),
    **logs** (structured, correlated), **traces** (request flow across services).
    Alert on **symptoms users feel** (SLO burn, error rate, latency), not every
    low-level metric. Page only on actionable, urgent conditions; everything else is
    a dashboard/ticket. Tie alerts to SLOs and error budgets.

??? question "Explain SLI/SLO/error budget and how it changes behavior."
    **SLI** = measured indicator (e.g. % successful requests). **SLO** = the target
    (99.9%). **Error budget** = allowed failure (0.1%). Budget healthy → ship fast;
    budget burning → slow down and prioritize reliability. It turns "how much
    reliability" into a shared, data-driven decision.

??? question "You get paged for high latency. Walk me through triage."
    Confirm scope on dashboards (which service/region/endpoint, since when).
    Correlate with recent **changes** (deploys, config, traffic). Use **traces** to
    find the slow hop (DB? downstream? GC?). Mitigate first (rollback, scale out,
    shed load), then root-cause. Communicate status. Postmortem after.

---

## Rapid-fire

| Q | A |
|---|---|
| Immutable infra? | replace instances/images rather than mutating in place |
| Blue/green? | two envs, instant switch + rollback |
| Canary? | small % traffic to new version, ramp on good metrics |
| IaC drift? | live state diverges from code |
| CrashLoopBackOff top causes? | failed probe, OOMKilled, bad config, startup crash |
| Requests vs limits? | scheduling vs capping (throttle/OOM) |
| Liveness vs readiness? | restart-if-dead vs remove-from-LB-if-not-ready |
| RED metrics? | Rate, Errors, Duration |
| Error budget? | allowed unreliability = 1 − SLO |
| Feature flag vs deploy? | activation control vs shipping code |

---

## Pitfalls interviewers probe

- Rebuilding artifacts per environment instead of promoting one.
- Baking environment config/secrets into images.
- Editing prod resources in the console (drift).
- Liveness probes too aggressive → false restarts.
- Alerting on causes not symptoms → fatigue.
- No rollback plan; investigating before restoring service.

---

## Self-quiz

1. Design a CI/CD pipeline for a containerized service.
2. Why promote one artifact instead of rebuilding per env?
3. A prod deploy broke — what's your order of operations?
4. Blue/green vs canary vs rolling — pick one for a risky change.
5. Debug a CrashLoopBackOff step by step.
6. Requests vs limits — what breaks if you omit each?
7. Explain error budgets and how they change shipping behavior.
8. You're paged for latency — how do you triage?

!!! note "Cross-links"
    Related: [AWS Interview Q&A](AWS_Interview_QA.md) ·
    [AI Engineer Interview Q&A](AI_Engineer_Interview_QA.md)
