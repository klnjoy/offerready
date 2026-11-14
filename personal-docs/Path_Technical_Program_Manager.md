---
icon: material/timeline-check
---

# Technical Program Manager Role Guide

*Last reviewed: November 2026*

A role guide for **Technical Program Manager (TPM)** interviews, including TPMs
who run AI and data platform programs. You own delivery of work that spans many
teams: the plan, dependencies, risks and communication, with enough technical
depth to be trusted by engineers. This page covers the role, the usual loop, the
rubric, the likely questions, and a 14-day plan.

!!! abstract "What this role is really testing"
    **Can you get a complex, cross-team technical program delivered without
    authority over the people doing the work?** Planning and sequencing,
    dependency and risk management, clear communication at every level, and
    technical depth to spot integration risk early. For AI programs, add
    evaluation gates, data dependencies and safety review.

    Managing a team of engineers directly? See the
    [Engineering Manager guide](Path_Engineering_Manager.md).

---

## What the role is in 2026

TPMs exist because large technical work crosses team boundaries, and someone has
to own the whole. That has not changed. What AI programs added:

- **Uncertain milestones.** Experiments may fail, so plans need decision points,
  not only dates.
- **Evaluation as a launch gate.** A quality bar on an agreed evaluation set,
  re-checked with every model or prompt change.
- **More workstreams.** Data access, privacy, safety review and model cost sit
  next to engineering and launch work.

Interviewers still spend most of their time on **program execution stories** and
**communication**. Technical depth is tested, but you will not be asked to write
production code.

| | Technical program manager | Project manager | Engineering manager | Product manager |
|---|---|---|---|---|
| **Owns** | Delivery of a cross-team program | Schedule and scope of a project | A team's people and delivery | What to build and why |
| **Technical depth** | High | Varies | High | Varies |
| **Judged on** | Program delivered, risks managed, clear communication | On time, on budget | Team outcomes and growth | Product outcomes |
| **Guide** | This page | — | [EM guide](Path_Engineering_Manager.md) | [PM guide](Path_AI_Product_Manager.md) |

---

## The interview loop by company type

These are **common patterns**, not a description of any one company's current
process. Ask the recruiter whether there is a system design round and how
technical it is.

### Big tech

Usually a program management round (a past program in depth), a technical or
system design round, a behavioural round on leadership without authority, and
often a cross-functional partner round. Expect long follow-ups on one program.

### AI-native startup

Fewer, broader rounds. Expect questions about bringing structure without slowing
a fast team, running launches with small teams, and AI-specific programs such as
shipping a model-powered feature safely.

### Enterprise or consulting

Governance, budgets, vendors and reporting matter more. Expect questions about
steering committees, change control, migrations and regulated environments.

---

## Scoring rubric: what "strong hire" sounds like

| Area | Strong hire | Weak signal |
|---|---|---|
| **Planning** | Starts from outcome and launch criteria; finds the critical path; plans the riskiest work first | A task list with dates and no reasoning |
| **Dependencies and risk** | Explicit owners and interfaces; risks with mitigations in the plan | Discovers problems at integration |
| **Execution** | Verifiable milestones; early, honest status; options when things slip | "Green" until it is suddenly red |
| **Communication** | Tailors to audience; same facts for everyone; drives decisions | Long status reports with no asks |
| **Technical depth** | Can sketch the architecture and explain where the risk is | Cannot follow the design discussion |
| **AI programs** | Evaluation, data, safety and cost as workstreams with gates | Treats an AI launch like any feature |

---

## The 20 questions you are most likely to get

### The role and leadership without authority

1. What does a TPM do that a project manager or engineering manager does not? →
   [TPM Q&A](TPM_Interview_QA.md)
2. How do you lead without authority? →
   [TPM Q&A](TPM_Interview_QA.md)
3. Tell me about a team that would not prioritise your program. →
   [TPM Q&A](TPM_Interview_QA.md) · [Behavioral / STAR](Behavioral_STAR_Interview_QA.md)

### Planning

4. How do you plan a large cross-team program? →
   [TPM Q&A](TPM_Interview_QA.md)
5. What is the critical path and how would you shorten it? →
   [TPM Q&A](TPM_Interview_QA.md)
6. How do you estimate when teams are unsure? →
   [TPM Q&A](TPM_Interview_QA.md)
7. A senior leader adds a requirement late. What do you do? →
   [TPM Q&A](TPM_Interview_QA.md)

### Dependencies and risk

8. How do you manage dependencies between teams? →
   [TPM Q&A](TPM_Interview_QA.md)
9. How do you run a risk register? →
   [TPM Q&A](TPM_Interview_QA.md)
10. A dependency team will be a month late. What do you do? →
    [TPM Q&A](TPM_Interview_QA.md)

### Execution and launch

11. How do you track program status honestly? →
    [TPM Q&A](TPM_Interview_QA.md)
12. How do you plan a launch, and what makes you call a no-go? →
    [TPM Q&A](TPM_Interview_QA.md)
13. Tell me about a program that slipped badly. →
    [TPM Q&A](TPM_Interview_QA.md)
14. Walk me through an incident during a launch. →
    [Production Incident Interviews](Interview_Production_Incidents.md)

### Communication

15. How do you communicate with executives versus engineers? →
    [TPM Q&A](TPM_Interview_QA.md)
16. Two senior leaders disagree on direction. What do you do? →
    [TPM Q&A](TPM_Interview_QA.md)

### Technical depth and AI programs

17. Walk me through the architecture of a system from one of your programs. →
    [System Design Q&A](System_Design_Interview_QA.md)
18. Run a program to launch an AI assistant to customers. →
    [TPM Q&A](TPM_Interview_QA.md) · [RAG & LLMOps Q&A](RAG_LLMOps_Interview_QA.md)
19. How is running an AI program different from a regular software program? →
    [TPM Q&A](TPM_Interview_QA.md)
20. Migrate many teams to a new data platform. →
    [TPM Q&A](TPM_Interview_QA.md)

---

## Common failure modes

- **Status reporter, not owner.** Describing meetings you ran instead of
  decisions you drove and risks you removed.
- **No technical substance.** Unable to say what the system does or why the
  integration was risky.
- **Only process words.** "We used a RAID log and weekly syncs" without saying
  what changed because of them.
- **Hiding bad news.** Stories where problems surfaced late.
- **No outcome.** The program launched, but did anyone use it?

---

## The skills this guide builds

| Skill | Why it matters at this level | Where you build it |
|---|---|---|
| **Program execution** | The core of every loop | [TPM Q&A](TPM_Interview_QA.md) · [Leadership & Delivery Q&A](Leadership_Delivery_Interview_QA.md) |
| **Behavioural stories** | Leadership without authority, conflict, failure | [Behavioral / STAR](Behavioral_STAR_Interview_QA.md) |
| **Technical depth** | Trust from engineers; spotting risk | [System Design Q&A](System_Design_Interview_QA.md) |
| **AI program knowledge** | Evaluation, data, safety and cost workstreams | [RAG & LLMOps Q&A](RAG_LLMOps_Interview_QA.md) · [AI Security Q&A](AI_Security_Interview_QA.md) |

---

## 14-day plan

| Day | Focus | Do |
|---|---|---|
| 1 | Baseline | Add the job in OfferReady. Answer questions 2, 4 and 10 out loud; note the gaps. |
| 2 | Program stories | Pick your two biggest programs. For each: goal, teams, critical path, top risks, what slipped, outcome. |
| 3 | Planning | Questions 4–7 using one of your programs. |
| 4 | Risk | Questions 8–10. Name a risk you mitigated early, with evidence. |
| 5 | Launch | Questions 11–14. Prepare one launch checklist you have used. |
| 6 | Technical | Draw the architecture of one of your programs and explain where the risk was (question 17). |
| 7 | Mock 1 | Voice mock focused on a program deep-dive. List every follow-up you missed. |
| 8 | Communication | Questions 15–16. Write a five-line executive update for a slipping program. |
| 9 | AI programs | Questions 18–19 and [RAG & LLMOps Q&A](RAG_LLMOps_Interview_QA.md) basics on evaluation. |
| 10 | Migrations | Question 20 and one more story about driving adoption. |
| 11 | Failure | Question 13: an honest story and the process change it led to. |
| 12 | Company | Learn the company's products and likely programs; prepare questions for them. |
| 13 | Mock 2 | Voice mock with Deep follow-ups on. |
| 14 | Light review | Re-read your program notes and [Cheat Sheets](Interview_Cheat_Sheets.md), then rest. |

---

## Are you ready? (self-check)

- [ ] I can walk through one program end to end, with the critical path and top risks.
- [ ] I can describe leading a team that did not report to me.
- [ ] I have an honest story about a slip and what I changed afterwards.
- [ ] I can sketch the architecture of a system I worked on and say where the risk was.
- [ ] I can write a clear executive update with decisions needed.
- [ ] I can explain what is different about running an AI program.

---

## Practise this in OfferReady

[:material-briefcase-plus: Add a job](https://getofferready.app/analyze){ .md-button .md-button--primary target=_blank rel=noopener }
[:material-microphone: Voice mock](https://getofferready.app/interview/voice){ .md-button target=_blank rel=noopener }
[:material-dumbbell: Practice questions](https://getofferready.app/practice){ .md-button target=_blank rel=noopener }

- **Add a job** reads the job description and builds a plan around your gaps.
- **Voice mock** runs a spoken interview. Turn on **Deep follow-ups** to be
  pushed on one program the way real TPM interviewers do.
- **Practice** gives you scored questions for this role, one at a time.

!!! note "Related role guides"
    [Engineering Manager](Path_Engineering_Manager.md) ·
    [Agile Coach & Scrum Master](Path_Agile_Coach_Scrum_Master.md) ·
    [AI & Technical Product Manager](Path_AI_Product_Manager.md) ·
    [Interview Guide overview](Interview_Guide_Overview.md)
