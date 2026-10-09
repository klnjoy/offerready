---
icon: material/airplane-takeoff
---

# Forward Deployed Engineer Role Guide

*Last reviewed: October 2026*

A role guide for **Forward Deployed Engineer (FDE)** interviews, including the
"forward deployed AI engineer" roles now common at model providers and AI
startups. In these roles you turn a vague customer need into working software,
fast, in a messy real environment, and explain it to people who are not
engineers. This page covers the role, the usual loop, the rubric, the likely
questions, and a 14-day plan. It links to the study pages rather than repeating
them.

!!! abstract "What this role is really testing"
    A hybrid of **strong engineering and high-stakes, customer-facing
    judgment.** Can you break down an ambiguous problem, ship a pragmatic thin
    slice, integrate with the customer's imperfect systems, troubleshoot live,
    and tie it all to a business outcome? Breadth and speed matter more than
    perfect depth in any one area.

    See [Senior / Staff / Principal / FDE](Interview_Level_Comparison.md) for what
    interviewers listen for at each level.

---

## What the role is in 2026

The FDE title comes from Palantir, where engineers were embedded with customers
to adapt the platform to each deployment. In 2025 and 2026 the model has spread
to model providers, AI-native startups, large software vendors and consultancies,
because enterprise AI projects tend to stall between demo and production and
someone has to own that gap at the customer's site. Industry write-ups through
2026 describe fast growth in FDE postings, though the figures vary a lot by
source and method
([Tomasz Tunguz, *FDE arms race*](https://tomtunguz.com/fde-arms-race/)), so treat
any single number with care.

A typical week mixes discovery calls, building and integrating (data access, auth,
an API, a RAG or agent workflow), demoing to stakeholders, and feeding what you
learned back to the product team. Success is measured by the customer reaching
production and the account growing, not by lines of code.

| | Forward deployed engineer | AI engineer | Solutions engineer / architect | AI platform engineer |
|---|---|---|---|---|
| **Builds** | Production software inside one customer's environment | LLM features for the company's own product | Demos, proofs of concept, reference designs | Shared infrastructure for internal AI teams |
| **Time horizon** | Weeks to months per engagement | Ongoing product roadmap | Pre-sale, days to weeks | Long-lived platform |
| **Owns** | Customer outcome and time to value | Feature quality, latency, cost | Technical win in a deal | Reliability, cost, adoption |
| **Writes production code?** | Yes, often in the customer's stack | Yes | Sometimes; mostly prototypes | Yes |
| **Hardest part** | Ambiguity, messy data, politics, speed | Quality and evaluation | Breadth and storytelling | Scale and multi-tenancy |
| **Guide** | This page | [AI Engineer guide](Path_AI_Engineer.md) | [Cloud Delivery Lead prep](Interview_Prep_Google_Cloud_Delivery_Lead.md) | [AI Platform guide](Path_AI_Platform_Engineer.md) |

---

## The interview loop by company type

These are **common patterns**, not a description of any one company's current
process. Ask the recruiter for the round list, and whether coding is in your own
editor, a shared pad, or a take-home.

### Frontier lab or model provider

| Round | What it tests | Length |
|---|---|---|
| Recruiter + hiring manager | Customer-facing experience, travel, motivation | 30 min each |
| Practical coding | Build something real with an API: parse data, call a model, handle errors | 60 min |
| Customer scenario / system design | Take a customer's ask to an architecture with evals, security and rollout | 60 min |
| Technical presentation or demo | Explain a past build to a mixed audience; handle hard questions | 45–60 min |
| Values / behavioural | Judgment under pressure, saying no to a customer, ownership | 45 min |

Expect the model provider's own API and its failure modes (rate limits, long
context, tool use) to come up, and strong interest in how you would measure
success at a customer.

### Big tech (cloud and enterprise software)

Usually a standard coding bar (one or two rounds), a solution-design round set at
a customer ("a retailer wants to put an agent on top of its order system"), and
behavioural rounds that probe customer obsession and ownership. Some loops add a
role-play where the interviewer plays a sceptical customer. Four to five rounds
on the onsite is typical.

### AI-native startup

Often the most distinctive loop. A **decomposition** round is common: an open
problem ("help a hospital cut no-shows") that you break into questions, data,
a first version and a measure of success, out loud, with no code. Then a paired
or take-home build, sometimes against a messy real dataset, and a long founder
conversation. The process can be quick, one to three weeks.

### Enterprise or consulting

A case-style loop. A technical screen, a case on a client problem, a
presentation to a panel that includes a partner or delivery lead, and questions
on estimating, managing scope and running workshops. Certifications and delivery
references can matter more here than anywhere else.

---

## Scoring rubric: what "strong hire" sounds like

| Round | Strong hire at senior | Strong hire at staff |
|---|---|---|
| **Decomposition** | Asks about users, constraints and success metrics before solving; produces a clear first slice | Reframes the problem ("the real issue is scheduling data, not AI"), sequences three phases, and names what would kill the project |
| **Practical coding** | Working code fast; handles bad input, API errors and retries; talks while building | Same, plus a structure the customer's team could own after you leave, with logs and config instead of hard-coded values |
| **Customer scenario design** | Sound architecture that fits the customer's existing stack; data access and auth handled | Rollout plan, eval and acceptance criteria agreed with the customer, cost estimate, and a plan for when the model is wrong |
| **Presentation / demo** | Clear story, right level for the audience, honest about limits | Handles a hostile question calmly and turns it into a next step; ties the work to revenue or cost |
| **Behavioural** | Specific stories of shipping under ambiguity | Stories of changing a customer's direction, or feeding field learning back into the product |

---

## The 20 questions you are most likely to get

### Decomposition and discovery

1. A customer says "we want AI for our support team." What are your first ten
   questions? → [Requirements → Production](Interview_Requirements_to_Production.md)
2. Break down "help a logistics company reduce late deliveries" into a first
   version you could ship in two weeks. →
   [FDE Live-Coding & Scenarios](FDE_LiveCoding_Scenarios_Prep.md)
3. How do you agree success criteria with a customer who cannot define them? →
   [FDE Q&A](Forward_Deployed_Engineer_Interview_QA.md)
4. When would you tell a customer not to use an LLM at all? →
   [Keep Asking Why](Interview_Why_Chains.md)

### Practical coding

5. Parse a messy CSV export, clean it, and load it into a queryable store. →
   [FDE Coding Prep](FDE_Coding_Interview_Prep.md) ·
   [Python Q&A](Python_Interview_QA.md)
6. Call a model API for each record with retries, rate limiting and a cost cap.
   → [Live-Coding Drills](Lab_LiveCoding_Drills.md)
7. Write SQL to find the customers whose usage dropped month on month. →
   [SQL Q&A](SQL_Interview_QA.md)
8. Wrap your script in a small API the customer's team can call. →
   [FastAPI](../Technologies/fastapi/index.md)

### Customer scenario and system design

9. Design a document Q&A assistant for a bank that cannot send data outside its
   cloud. → [RAG](../GenAI-Topics/rag/index.md) ·
   [Enterprise](../Enterprise/index.md)
10. Design an agent that updates records in the customer's CRM. How do you keep
    it safe? → [Agent Engineering](../GenAI-Topics/agent-engineering/index.md) ·
    [AI Security](../AI-Security/index.md)
11. Connect the assistant to three internal systems with different auth. →
    [MCP](../GenAI-Topics/mcp/index.md) ·
    [Identity & API security](../AI-Security/identity-api-security.md)
12. The customer's data lives in Snowflake. What runs where? →
    [Snowflake Cortex](../Snowflake-Cortex/index.md)
13. How do you prove to the customer that the system is good enough to go live?
    → [Observability & Eval](../GenAI-Topics/observability/index.md)
14. Estimate the monthly running cost for 5,000 users. →
    [Cost Optimization](../GenAI-Topics/cost-optimization/index.md)

### Live troubleshooting

15. Your demo breaks in front of the customer's CTO. What do you do in the next
    five minutes? → [Production Incident Interviews](Interview_Production_Incidents.md)
16. Answers were fine in the pilot and are wrong in production. Walk me through
    it. → [Retrieval Tuning](../GenAI-Topics/retrieval-tuning/index.md)

### Presentation and behavioural

17. Explain your last design to a non-technical executive in 60 seconds. →
    [Behavioral / STAR](Behavioral_STAR_Interview_QA.md)
18. Tell me about a time a customer asked for something you thought was wrong.
    → [Behavioral / STAR](Behavioral_STAR_Interview_QA.md)
19. Tell me about shipping under a deadline that you could not move. →
    [Behavioral / STAR](Behavioral_STAR_Interview_QA.md)
20. What field feedback have you turned into a product change? →
    [FDE Q&A](Forward_Deployed_Engineer_Interview_QA.md)

---

## Common failure modes

- **Rehearsed answers that collapse under follow-up.** A polished "discovery
  framework" falls apart when the interviewer, playing the customer, says "we
  don't have labelled data" or "legal won't approve that." Practise with someone
  who pushes back, and adapt instead of restarting your script.
- **Solving before asking.** Jumping to an architecture in the first minute is
  the most common FDE fail. Ask about users, data, constraints and success first.
- **Gold-plating.** Proposing a six-month platform when the customer needs a
  working slice in two weeks.
- **Ignoring the customer's stack.** Designing on your favourite cloud when the
  customer is on another, or ignoring their identity provider and network rules.
- **Jargon with non-engineers.** If an executive asks "will it work?", "we use
  hybrid retrieval with a cross-encoder" is the wrong answer.
- **Slow or brittle coding.** FDE coding is practical, but the bar is real.
  Freezing on file parsing or error handling is a hard no.
- **No business outcome.** Stories that end at "we deployed it" with no effect on
  time, cost or revenue.

---

## The skills this guide builds

| Skill | Why it decides FDE | Where you build it |
|-------|--------------------|--------------------|
| **Decompose ambiguity** | Turn "we want AI for support" into a shippable slice | [Requirements → Production](Interview_Requirements_to_Production.md) |
| **Build a pragmatic thin slice** | Working over perfect; integrate messy reality | [FDE Live-Coding & Scenarios](FDE_LiveCoding_Scenarios_Prep.md) · [Setup Guides](../Setup-Guides/index.md) |
| **Live troubleshooting** | Recover in front of the customer | [Production Incident Interviews](Interview_Production_Incidents.md) |
| **Breadth across the stack** | You'll touch data, RAG, agents, cloud, APIs | [GenAI Topics](../GenAI-Topics/index.md) · [Technologies](../Technologies/index.md) |
| **Explain to non-engineers** | Tie the build to the customer's outcome | [Behavioral / STAR](Behavioral_STAR_Interview_QA.md) |

---

## 14-day plan

FDE rewards breadth and speed, so this plan is wider and more hands-on.

| Day | Focus | Do |
|---|---|---|
| 1 | Baseline | Add the job in OfferReady. Answer questions 1, 2 and 17 out loud and record yourself. |
| 2 | The role | [Level Comparison](Interview_Level_Comparison.md) and [FDE Q&A](Forward_Deployed_Engineer_Interview_QA.md). Learn the FDE habit: constraints and success criteria first. |
| 3 | Decomposition | Three one-line customer asks, 10 minutes each: questions, first slice, success metric ([Requirements → Production](Interview_Requirements_to_Production.md)). |
| 4 | Build blocks | [RAG](../GenAI-Topics/rag/index.md), [Agent Engineering](../GenAI-Topics/agent-engineering/index.md), [MCP](../GenAI-Topics/mcp/index.md): enough to build, not to lecture. |
| 5 | Stand it up | From the [Setup Guides](../Setup-Guides/index.md): an [LLM](../Setup-Guides/llm-access/index.md), a [vector DB](../Setup-Guides/vector-db-setup/index.md), a [RAG app](../Setup-Guides/first-rag/index.md), an [agent](../Setup-Guides/first-agent/index.md). Time yourself. |
| 6 | Coding bar | [FDE Coding Prep](FDE_Coding_Interview_Prep.md): questions 5–7, timed. |
| 7 | Mock 1 | Voice mock with a customer-scenario round. Note every follow-up that threw you. |
| 8 | Timed builds | [FDE Live-Coding & Scenarios](FDE_LiveCoding_Scenarios_Prep.md) and one [Hackathon Build](Lab_Hackathon_Builds.md). |
| 9 | Integration | [FastAPI](../Technologies/fastapi/index.md), [Identity & API security](../AI-Security/identity-api-security.md), [Snowflake Cortex](../Snowflake-Cortex/index.md): the customer's data and auth live somewhere. |
| 10 | Prove it works | [Observability & Eval](../GenAI-Topics/observability/index.md) and [Cost Optimization](../GenAI-Topics/cost-optimization/index.md): acceptance criteria and a cost estimate for your day-3 designs. |
| 11 | Live fixes | Two [Production Incidents](Interview_Production_Incidents.md), narrated as if the customer is watching. |
| 12 | Stories | Five [STAR](Behavioral_STAR_Interview_QA.md) stories: ambiguity, pushback, deadline, failure, field feedback. Each with a number. |
| 13 | Mock 2 | Voice mock with Deep follow-ups on. Then a 60-second executive explanation of your best design. |
| 14 | Light review | [Cheat Sheets](Interview_Cheat_Sheets.md), your stories, rest. |

---

## Are you ready? (self-check)

- [ ] I ask about the customer's constraints and success criteria *first*.
- [ ] I can scope a vague ask into a shippable thin slice and defend the cut.
- [ ] I can build a working RAG app / agent fast, integrating messy real systems.
- [ ] I can troubleshoot live and narrate diagnose → mitigate → prevent.
- [ ] I have breadth across RAG, agents, data platforms, and APIs.
- [ ] I can explain the build and its business impact to a non-engineer.
- [ ] I can adapt when the "customer" pushes back, instead of restarting my script.

If most boxes are checked, you're pitching as an FDE. If you're strong on depth
but freeze on ambiguity or customer communication, drill decomposition and
translation.

---

## Practise this in OfferReady

[:material-briefcase-plus: Add a job](https://klnjoy.github.io/offerready-app/analyze){ .md-button .md-button--primary target=_blank rel=noopener }
[:material-microphone: Voice mock](https://klnjoy.github.io/offerready-app/interview/voice){ .md-button target=_blank rel=noopener }
[:material-dumbbell: Practice questions](https://klnjoy.github.io/offerready-app/practice){ .md-button target=_blank rel=noopener }

- **Add a job** reads the FDE job description and builds a plan around your gaps.
- **Voice mock** is the closest thing to a customer call. Turn on **Deep
  follow-ups** so the interviewer keeps asking why, and use the **whiteboard** in
  the system-design round to sketch the customer's architecture.
- **Practice** gives you scored questions for this role, one at a time.

## Sources

- Latent Space, [*The Rise of the AI Engineer*](https://www.latent.space/p/ai-engineer) (June 2023), for the AI engineer definition used in the comparison.
- Tomasz Tunguz, [*FDE arms race*](https://tomtunguz.com/fde-arms-race/) (2026), a round-up of FDE hiring data from several sources.

!!! note "Related role guides"
    [AI Engineer](Path_AI_Engineer.md) ·
    [AI Platform Engineer](Path_AI_Platform_Engineer.md) ·
    [Data Platform Engineer](Path_Data_Platform.md) ·
    [Staff / Principal AI Architect](Path_Staff_Principal_Architect.md) ·
    [Interview Guide overview](Interview_Guide_Overview.md)
