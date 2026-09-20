---
icon: material/stairs-up
---

# Senior vs Staff vs Principal vs FDE

The same question ("design a RAG system") is graded very differently at each
level. This page explains **what interviewers are really listening for** at each
level so you can pitch your answers correctly. It describes what strong answers
demonstrate — it does **not** score or rank you.

!!! abstract "The one-line difference"
    **Senior** makes it work. **Staff** makes it work *at scale, across teams,
    with the trade-offs named*. **Principal** decides *whether and how the org
    should build it at all* (strategy, economics, governance). **FDE** makes it
    work *in a messy customer environment, fast, and can explain it to the
    customer.*

---

## What each level is graded on

| Dimension | Senior | Staff | Principal | FDE |
|-----------|--------|-------|-----------|-----|
| **Scope** | A component/service | A system across teams | Enterprise / org strategy | A customer's whole problem |
| **Depth** | Implementation + debugging | Architecture + trade-offs | Direction + economics + governance | Breadth + rapid integration |
| **Ambiguity** | Given a spec | Shapes the spec | Sets the direction | Thrives without a spec |
| **Failure focus** | Fix the bug | Design so it can't happen | Ensure the org can operate it | Recover live, in front of the customer |
| **Influence** | Own team | Cross-team | Org / industry | The customer + delivery team |
| **Communication** | Explain to engineers | Align engineers + PMs | Persuade leadership | Explain to non-technical customer |

---

## Senior AI Engineer

**Listening for:** can you *build it well and debug it*? Technology depth,
solid implementation, and knowing the failure modes of the tools you use.

**Strong answers demonstrate:**

- A working, correct design with the right primitives (hybrid retrieval + rerank,
  bounded agent loop, gated tools).
- Real debugging instinct ("I'd read the Query Profile / the trace and look for
  X").
- Knowing the trade-offs *of your components* (why this embedding model, why
  temperature 0).
- Testing + basic eval.

**What's missing at this level (and fine):** org-wide strategy, cross-team
concerns, cost economics at scale.

---

## Staff AI Engineer

**Listening for:** can you *architect a system and defend the trade-offs* across
teams and scale? You're expected to shape the problem, not just solve the given
one.

**Strong answers demonstrate:**

- **Trade-offs named explicitly** for every choice (managed vs self-host,
  single- vs multi-agent, precompute vs on-demand) with the reasoning.
- **Scale + reliability** thinking (bottlenecks, failure modes, graceful
  degradation, SLOs).
- **Cross-cutting concerns** — security, observability, eval-gated CI/CD — woven
  in, not bolted on.
- Influencing *how other teams* build (patterns, guardrails, platform thinking).

**The tell:** a Staff candidate volunteers the trade-off before being asked, and
says how they'd *verify* the system in production.

---

## Principal AI Engineer

**Listening for:** *should we build this, and how does it fit the org's technical
direction, economics, and risk posture?* Strategy and judgment over any single
design.

**Strong answers demonstrate:**

- **Framing the decision**, not just the design: build vs buy, when *not* to use
  an agent/LLM at all, what the business actually needs.
- **Economics** — cost modeling, the quality/latency/reliability/cost balance,
  and the long-term TCO, not just "it works."
- **Governance + risk** — data governance, AI security posture, compliance,
  blast radius, org-wide standards.
- **Long-horizon** — how this ages, migration paths, avoiding lock-in, what the
  platform looks like in two years.
- Enabling many teams (reference architectures, paved roads) rather than one
  system.

**The tell:** a Principal reframes the question ("the real problem is X; here's
whether we should solve it with AI at all"), and reasons about cost and
organizational impact unprompted.

---

## Forward Deployed Engineer (FDE)

**Listening for:** can you *turn a vague customer need into working software,
fast, in their messy environment, and communicate it?* A hybrid of strong
engineering and high-stakes customer-facing judgment.

**Strong answers demonstrate:**

- **Decomposing ambiguity** — turning "we want AI to help support" into a
  concrete, shippable slice with clarifying questions.
- **Rapid, pragmatic building** — a working thin slice over a perfect design;
  integrating with the customer's existing (imperfect) systems.
- **Production troubleshooting** under pressure, sometimes live.
- **Business impact + communication** — tying the build to the customer's
  outcome and explaining it to non-engineers.
- Comfort with the **"implementation gap"** (lab code meets real infra/data).

**The tell:** an FDE candidate asks about the *customer's* constraints and
success criteria first, scopes hard, and can explain the trade-offs to a
non-technical stakeholder. (See the dedicated
[FDE Interview Q&A](Forward_Deployed_Engineer_Interview_QA.md) and
[FDE Live-Coding & Scenarios](FDE_LiveCoding_Scenarios_Prep.md).)

---

## How to level up an answer

Take a Senior-level answer and push it up:

1. **Senior → Staff:** add the **trade-off** for each choice, the **failure
   modes**, and how you'd **verify at scale**.
2. **Staff → Principal:** add **should-we-build-this**, **cost economics**, and
   **org/governance** impact; reframe the problem.
3. **Any → FDE:** add **clarifying the customer's real need**, **scope
   discipline**, **integration with messy reality**, and **explaining it to a
   non-engineer**.

!!! tip "Practice"
    Take one design from [Requirements → Production](Interview_Requirements_to_Production.md)
    and answer it three times, once at each level, changing what you emphasize.
    Then defend it with the [Why-chains](Interview_Why_Chains.md).

!!! note "Related"
    [Requirements → Production](Interview_Requirements_to_Production.md) ·
    [The Interviewer Keeps Asking Why](Interview_Why_Chains.md) ·
    [Master Interview Simulator](Interview_Master_Simulator.md) ·
    [Behavioral / STAR](Behavioral_STAR_Interview_QA.md)
