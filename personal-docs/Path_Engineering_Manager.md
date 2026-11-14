---
icon: material/account-tie
---

# Engineering Manager Role Guide (AI & Data Teams)

*Last reviewed: November 2026*

A role guide for **Engineering Manager** interviews, with a focus on managers who
lead AI, ML or data teams. You own people, delivery and the health of the team,
and you are still expected to judge technical trade-offs. This page covers the
role, the usual loop, the rubric, the likely questions, and a 14-day plan. It
links to the question pages rather than repeating them.

!!! abstract "What this role is really testing"
    **Can you build a team that delivers well, keeps delivering, and grows?**
    People management (one-to-ones, feedback, performance, hiring), execution
    (priorities, planning, incidents), and enough technical judgement to be
    trusted on architecture and risk. For AI and data teams, add planning under
    uncertainty, evaluation as part of done, and cost.

    Running a cross-team program without direct reports? See the
    [Technical Program Manager guide](Path_Technical_Program_Manager.md).

---

## What the role is in 2026

The core of the job has not changed: hire well, set clear goals, give honest
feedback, protect the team's focus and ship. What AI changed is the kind of work
many teams now do and the questions interviewers ask about it:

- **Uncertain work.** A model or retrieval change may not work at all. Managers
  are asked how they plan, estimate and report progress on experiments.
- **Quality you measure.** "It works" is not enough for an AI feature. Strong
  answers make evaluation part of the definition of done.
- **New costs.** Model API and GPU spend sits next to cloud cost, and someone has
  to own it.
- **Responsible use.** Privacy, safety review and human oversight for
  high-stakes features.

Most loops still weight **people and execution stories** most heavily. A strong
AI vocabulary will not cover for weak behavioural answers.

| | Engineering manager | Technical program manager | Tech lead / staff engineer |
|---|---|---|---|
| **Owns** | People, team health, team delivery | A program across many teams | Technical direction of a system |
| **Direct reports** | Yes | Usually no | Usually no |
| **Judged on** | Team outcomes, retention, growth, hiring | Program delivered on time with risks managed | Design quality, technical leverage |
| **Typical question** | "Tell me about an underperformer" | "A dependency is a month late" | "Design this system" |
| **Guide** | This page | [TPM guide](Path_Technical_Program_Manager.md) | [Staff / Principal guide](Path_Staff_Principal_Architect.md) |

---

## The interview loop by company type

These are **common patterns**, not a description of any one company's current
process. Ask the recruiter how many rounds are behavioural, whether there is a
coding or system design round, and how the team is structured.

### Big tech

Usually several behavioural or "leadership" rounds (people, execution,
collaboration), a system design round pitched at the level of the team's
systems, and sometimes a light coding round. Interviewers often follow a
structured set of competencies and dig into one story for a long time.

### AI-native startup

Fewer rounds, more hands-on. Expect a deep technical conversation about what the
team builds (for example evaluation, retrieval or data pipelines), founder or
executive rounds on how you hire and set direction, and questions about doing
more with a small team.

### Enterprise or consulting

Stakeholder management, delivery against commitments and working within
governance matter most. Expect questions about budgets, vendors, compliance and
leading teams across locations.

---

## Scoring rubric: what "strong hire" sounds like

| Area | Strong hire | Weak signal |
|---|---|---|
| **People** | Specific stories with what they said and did, and the outcome for the person | General statements ("I believe in empowerment") with no example |
| **Performance** | Found the cause, set clear expectations, followed through either way | Avoided the conversation or moved the problem elsewhere |
| **Execution** | Priorities tied to goals, early warnings, options offered to stakeholders | Surprises, heroics, or blaming other teams |
| **Hiring** | Structured process, clear bar, learned from a mis-hire | "I go with my gut" |
| **Technical judgement** | Asks the right questions, knows when to step in and when not to | Either hands-off or making every decision |
| **AI and data teams** | Plans experiments with decision points; evaluation and cost are part of done | Treats AI work like fixed-scope features |

---

## The 20 questions you are most likely to get

### People and team health

1. How would you describe your management style? →
   [Engineering Manager Q&A](Engineering_Manager_Interview_QA.md)
2. How do you run one-to-ones? →
   [Engineering Manager Q&A](Engineering_Manager_Interview_QA.md)
3. Tell me about a time you managed an underperformer. →
   [Engineering Manager Q&A](Engineering_Manager_Interview_QA.md)
4. How do you grow senior engineers? →
   [Engineering Manager Q&A](Engineering_Manager_Interview_QA.md)
5. How do you handle conflict between two engineers? →
   [Engineering Manager Q&A](Engineering_Manager_Interview_QA.md)
6. Tell me about a time you gave difficult feedback. →
   [Engineering Manager Q&A](Engineering_Manager_Interview_QA.md)

### Delivery and execution

7. How do you decide what your team works on? →
   [Engineering Manager Q&A](Engineering_Manager_Interview_QA.md)
8. A key project is slipping. What do you do? →
   [Engineering Manager Q&A](Engineering_Manager_Interview_QA.md)
9. How do you measure your team's effectiveness? →
   [Engineering Manager Q&A](Engineering_Manager_Interview_QA.md)
10. How do you handle technical debt? →
    [Engineering Manager Q&A](Engineering_Manager_Interview_QA.md)
11. Walk me through a production incident from a manager's view. →
    [Production Incident Interviews](Interview_Production_Incidents.md)

### Hiring

12. How do you hire well? →
    [Engineering Manager Q&A](Engineering_Manager_Interview_QA.md)
13. Tell me about a hire that did not work out. →
    [Engineering Manager Q&A](Engineering_Manager_Interview_QA.md)

### Technical judgement

14. Your team wants to rewrite a core system. How do you decide? →
    [Engineering Manager Q&A](Engineering_Manager_Interview_QA.md)
15. Design a system your team would own, at a high level. →
    [System Design Q&A](System_Design_Interview_QA.md)

### Leading AI and data teams

16. What is different about managing an AI or ML team? →
    [Engineering Manager Q&A](Engineering_Manager_Interview_QA.md)
17. How do you plan research-like AI work? →
    [Engineering Manager Q&A](Engineering_Manager_Interview_QA.md)
18. Your AI feature gives wrong answers to some users. What do you do? →
    [Engineering Manager Q&A](Engineering_Manager_Interview_QA.md) ·
    [RAG & LLMOps Q&A](RAG_LLMOps_Interview_QA.md)

### Stakeholders

19. How do you work with your product manager? →
    [Engineering Manager Q&A](Engineering_Manager_Interview_QA.md)
20. What would you do in your first 90 days? →
    [Engineering Manager Q&A](Engineering_Manager_Interview_QA.md)

---

## Common failure modes

- **"We" with no "I".** Interviewers need to know what you personally did.
- **Stories with no outcome.** End with what changed, for the person, the team
  or the business.
- **Only success stories.** Have honest stories about a mis-hire, a missed date
  and a conflict you handled badly, and what you learned.
- **Hero manager.** Fixing things yourself late at night is not a scalable
  answer.
- **Metrics as targets.** Turning delivery metrics into individual goals is a red
  flag.
- **Treating AI work as fixed scope.** No mention of experiments, evaluation or
  how to report uncertainty.

---

## The skills this guide builds

| Skill | Why it matters at this level | Where you build it |
|---|---|---|
| **People stories** | Most rounds are behavioural | [Engineering Manager Q&A](Engineering_Manager_Interview_QA.md) · [Behavioral / STAR](Behavioral_STAR_Interview_QA.md) |
| **Execution** | Priorities, planning, slips and incidents | [Leadership & Delivery Q&A](Leadership_Delivery_Interview_QA.md) · [Production Incidents](Interview_Production_Incidents.md) |
| **Technical judgement** | Earn trust in design and risk discussions | [System Design Q&A](System_Design_Interview_QA.md) |
| **AI team leadership** | Planning under uncertainty, evaluation, cost | [Engineering Manager Q&A](Engineering_Manager_Interview_QA.md) · [RAG & LLMOps Q&A](RAG_LLMOps_Interview_QA.md) |

---

## 14-day plan

| Day | Focus | Do |
|---|---|---|
| 1 | Baseline | Add the job in OfferReady. Answer questions 1, 3 and 8 out loud; note the gaps. |
| 2 | Story bank | Write eight real stories: underperformer, conflict, hire, mis-hire, slip, incident, growth, disagreement with a partner. |
| 3 | People | Questions 1–6. Each answer: situation, what you did, outcome, what you learned. |
| 4 | Execution | Questions 7–11. Practise offering options to a stakeholder, not just a status. |
| 5 | Hiring | Questions 12–13. Describe your loop and your bar in concrete terms. |
| 6 | Technical | Question 14, then one [System Design](System_Design_Interview_QA.md) question at the level of your team's systems. |
| 7 | Mock 1 | Voice mock focused on behavioural rounds. List every follow-up you struggled with. |
| 8 | AI teams | Questions 16–18. Prepare one example of planning an experiment with a decision point. |
| 9 | Stakeholders | Questions 19–20 and [Leadership & Delivery Q&A](Leadership_Delivery_Interview_QA.md). |
| 10 | Weak stories | Rewrite the two stories that went worst in mock 1. |
| 11 | Company | Learn the company's products, team and recent launches; prepare questions for them. |
| 12 | System design | One more design round, explaining trade-offs as a manager would. |
| 13 | Mock 2 | Voice mock with Deep follow-ups on. |
| 14 | Light review | Re-read your story bank and [Cheat Sheets](Interview_Cheat_Sheets.md), then rest. |

---

## Are you ready? (self-check)

- [ ] I have at least eight real stories, each with a clear outcome.
- [ ] I can describe how I handled an underperformer from start to finish.
- [ ] I can explain how I set priorities and say no.
- [ ] I can describe my hiring process and a hire I would do differently.
- [ ] I can discuss a technical trade-off in my team's systems with confidence.
- [ ] I can explain how I plan and report AI work that may not succeed.
- [ ] I know what I would do in my first 90 days here.

---

## Practise this in OfferReady

[:material-briefcase-plus: Add a job](https://getofferready.app/analyze){ .md-button .md-button--primary target=_blank rel=noopener }
[:material-microphone: Voice mock](https://getofferready.app/interview/voice){ .md-button target=_blank rel=noopener }
[:material-dumbbell: Practice questions](https://getofferready.app/practice){ .md-button target=_blank rel=noopener }

- **Add a job** reads the job description and builds a plan around your gaps.
- **Voice mock** runs a spoken interview. Turn on **Deep follow-ups** to be
  pushed the way a real manager interviewer digs into one story.
- **Practice** gives you scored questions for this role, one at a time.

!!! note "Related role guides"
    [Technical Program Manager](Path_Technical_Program_Manager.md) ·
    [Agile Coach & Scrum Master](Path_Agile_Coach_Scrum_Master.md) ·
    [AI & Technical Product Manager](Path_AI_Product_Manager.md) ·
    [Staff / Principal AI Architect](Path_Staff_Principal_Architect.md) ·
    [Interview Guide overview](Interview_Guide_Overview.md)
