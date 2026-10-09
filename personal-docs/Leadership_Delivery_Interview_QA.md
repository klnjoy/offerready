---
icon: material/account-group
---

# Leadership & Delivery Interview Q&A — Senior & Scenario-Based

*Last reviewed: October 2026*

Senior questions for tech leads, delivery leads and engineers moving toward management: planning, risk, stakeholders, slipping projects, technical debt, incidents, mentoring, hiring and underperformance. Behavioural answers follow STAR structure: Situation, Task, Action, Result, then what you learned.

## Core concepts

??? question "How do you plan and estimate a large engineering project?"
    **Short answer:** Break the work into milestones that each deliver something verifiable, estimate in ranges with explicit assumptions, and front-load the riskiest unknowns.

    **In depth:**

    - Start from the outcome and constraints, then decompose into milestones of a few weeks each.
    - Estimate with the engineers doing the work, using ranges such as six to nine weeks, not single dates.
    - Spike or prototype the biggest unknowns first so estimates tighten early.
    - Add explicit buffer for integration, testing and dependencies rather than padding every task.
    - Track actuals against estimates and re-forecast every sprint or two.

    **Follow-up they'll ask:** How do you answer 'just give me a date'? Give a date with a confidence level and the assumptions it depends on, and commit to updating it.

??? question "How do you manage risk and cross-team dependencies?"
    **Short answer:** Keep a live risk and dependency register with owners and dates, engage dependent teams early, and design the plan so a late dependency does not block everything.

    **In depth:** List each risk with likelihood, impact, an owner and a mitigation, and review it weekly rather than writing it once. For dependencies, agree the interface and the date with the other team's lead, and get it on their roadmap, not just a verbal yes. Reduce coupling where possible: build against a contract or mock, sequence independent work first, or take on a small piece yourselves. Escalate early when a dependency slips; late escalation leaves leadership no options. Make the critical path visible to stakeholders.

    **Follow-up they'll ask:** What is a sign of a hidden risk? A task that has been 90 percent done for two weeks.

??? question "How do you manage stakeholders with different priorities?"
    **Short answer:** Map who has influence and what each cares about, communicate on a predictable cadence in their terms, and bring conflicts into the open for the right decision-maker.

    **In depth:**

    - Build a simple map: decision-makers, influencers, people affected and their goals.
    - Tailor communication: executives want status, risks and decisions needed; engineers want detail.
    - Use a regular written update with a clear red, amber or green status and the reasons.
    - When priorities conflict, frame the trade-off with data and escalate to whoever owns the priority call.
    - Never let a stakeholder be surprised by bad news in a meeting.

    **Follow-up they'll ask:** How do you handle a stakeholder who goes around you? Talk to them directly, understand the need, and agree a channel that works for them.

??? question "How do you negotiate time for technical debt with product leadership?"
    **Short answer:** Frame debt in business terms, such as slower delivery, incidents or risk, quantify it where you can, and propose a sustained allocation rather than a one-off rewrite.

    **In depth:** Product leaders rarely object to debt work; they object to unclear value. Show evidence: lead time for changes in the affected area, incident counts, on-call hours or how long a recent feature took versus estimate. Tie the fix to an upcoming roadmap item that the debt is slowing. Propose a steady allocation, often 15 to 25 percent of capacity, plus specific larger items with defined outcomes. Report back on results, such as faster deploys, so the next request is easier.

    **Follow-up they'll ask:** What if they still say no? Accept the decision, record the risk explicitly, and revisit with new data when it bites.

??? question "How do you measure team delivery performance without creating bad incentives?"
    **Short answer:** Use system-level measures such as the DORA metrics alongside outcome and health indicators, and never use them to rank individuals.

    **In depth:**

    - DORA: deployment frequency, lead time for changes, change failure rate and time to restore service.
    - Add outcomes: are features moving the business metrics they were meant to?
    - Add health: on-call load, attrition and engagement survey results.
    - Use trends for the team to improve, not targets to hit; targets on a metric get gamed.
    - Frameworks like SPACE remind you that productivity has several dimensions, including satisfaction and collaboration.

    **Follow-up they'll ask:** Why not measure story points or lines of code? They measure activity, not value, and are trivially gamed.

??? question "How do you lead a major incident and run a blameless postmortem?"
    **Short answer:** During the incident, separate roles and focus on restoring service; afterwards, run a blameless review that finds systemic causes and produces owned, tracked actions.

    **In depth:** Assign an incident commander who coordinates rather than debugs, an operations lead and a communications lead. Prioritise mitigation, such as rollback or failover, over root cause. Post updates on a fixed cadence. Within a few days, write a postmortem with a timeline, impact, contributing factors and what went well. Blameless means asking why the system allowed the mistake, not who made it, which keeps people honest. Limit actions to a few high-value items with owners and dates, and review completion.

    **Follow-up they'll ask:** How do you know postmortems work? Repeat incidents of the same class decline and action items actually close.

??? question "How do you mentor senior engineers rather than just juniors?"
    **Short answer:** Focus on scope, judgement and influence rather than skills: give them stretch ownership, coach through questions, and make their work visible.

    **In depth:**

    - Agree their goals, such as reaching staff level, and what evidence that level requires.
    - Give them ownership of an ambiguous, cross-team problem with you as a sounding board.
    - Coach by asking how they would approach it and what trade-offs they see, rather than giving answers.
    - Review design docs together for clarity and stakeholder thinking, not just correctness.
    - Sponsor them: put their names on work in leadership forums.

    **Follow-up they'll ask:** How do you know mentoring is working? They handle situations without you that they used to escalate.

??? question "How do you hold a high hiring bar while still filling roles quickly?"
    **Short answer:** Define what good looks like before interviewing, use structured interviews with calibrated rubrics, and fix pipeline speed rather than lowering the bar.

    **In depth:** Write a role scorecard with the competencies and level expectations. Use structured interviews where each interviewer assesses specific competencies with consistent questions, and score independently before the debrief to avoid anchoring. Calibrate interviewers regularly. Speed problems are usually process problems: slow scheduling, slow feedback or unclear decision-makers, so set targets such as feedback within one day. A bad hire costs far more than a few extra weeks open, but candidates also drop out of slow processes.

    **Follow-up they'll ask:** How do you handle a split debrief? Go back to the scorecard evidence; if strong concerns remain on a core competency, it is a no.

## Scenarios

??? question "Your project is going to miss its committed date by six weeks. What do you do?"
    **Short answer:** Confirm the size of the slip, tell stakeholders early with options, and agree a new plan, rather than hoping the team catches up.

    **In depth:**

    - Situation: midway through a migration, integration work turns out much larger than estimated.
    - Task: reset expectations and protect the most important outcome.
    - Action: re-estimate with the team, find root causes, then present options: cut scope to hit the date, add specific help, or move the date. Each option comes with its risks.
    - Result: the sponsor chooses a reduced first release on the original date with the rest four weeks later, and trust is preserved because nobody was surprised.
    - Learning: integration risk is now spiked in the first two weeks of every project.

    **Follow-up they'll ask:** Why not just add engineers? Adding people late often slows a project because of ramp-up and coordination costs.

??? question "Tell me about a time you disagreed with a senior stakeholder."
    **Short answer:** Use STAR to show you disagreed with evidence, privately and respectfully, listened to their reasoning, and then committed to the decision once made.

    **In depth:**

    - Situation: a VP wants to launch a feature to all customers at once ahead of a conference.
    - Task: the team believes a full launch risks an outage given untested load.
    - Action: you meet privately, acknowledge the business goal, show load test data and propose a launch to a subset of customers with a public announcement, which meets the conference goal.
    - Result: the VP agrees to a staged rollout; a performance bug is found at 10 percent of traffic and fixed before the full launch.
    - Learning: offer a path to their goal, not just objections.

    **Follow-up they'll ask:** What if they had overruled you? Disagree and commit, document the risk, and prepare mitigations such as a rollback plan.

??? question "How have you influenced a decision across teams where you had no authority?"
    **Short answer:** Build shared understanding of the problem first, bring data, involve others in shaping the solution, and find a sponsor if needed.

    **In depth:** A strong STAR example: several teams run their own logging pipelines, causing high cost and inconsistent alerting. You start by interviewing team leads about their pain, collecting cost and incident data, and writing a short proposal that others review and edit, so it becomes partly theirs. You pilot with one willing team and share results, such as a 30 percent cost reduction. You bring the evidence to an engineering leadership forum to secure a migration commitment. The result is broad adoption within two quarters. Lessons include that early co-authors become advocates.

    **Follow-up they'll ask:** What do you do with a team that resists? Understand their specific blocker, often capacity, and offer help rather than pressure.

??? question "You are asked to run a migration program across ten teams. How do you structure it?"
    **Short answer:** Make migration easy and safe through tooling, sequence teams by risk, track progress publicly, and secure leadership commitment on the deadline and old-system shutdown.

    **In depth:**

    - Define the end state and success criteria, including when the old system is switched off.
    - Build tooling, docs and a migration guide; do the first one or two migrations with the platform team.
    - Sequence: a low-risk early adopter, then the bulk, then the hardest cases with dedicated help.
    - Track each team's status on a shared dashboard and review weekly.
    - Get migration time into each team's planning, endorsed by leadership.
    - Run old and new in parallel with a validation step, and plan rollback.

    **Follow-up they'll ask:** How do you handle the last few stragglers? Escalate with clear cost data on running the old system, and offer hands-on support.

??? question "How would you explain a technical trade-off to a non-technical executive?"
    **Short answer:** Lead with the business decision and its consequences, use two or three clear options in plain language, and give your recommendation with the risk of each.

    **In depth:** For example, choosing between shipping in four weeks on a quick solution or eight weeks on a durable one. Explain the quick option as faster to market but likely to need rework within six months and higher support cost; the durable option as later but cheaper over a year. Use a simple table of time, cost, risk and what customers notice. Avoid jargon; use analogies only if they are accurate. State your recommendation and what you would need from them, then check understanding by asking what concerns they have.

    **Follow-up they'll ask:** What if they choose the option you advised against? Execute it well, and make the follow-up costs visible in the plan.

??? question "A member of your team is underperforming. How do you handle it?"
    **Short answer:** Address it early and privately with specific examples, understand the cause, agree clear expectations and support, and follow through with HR process if things do not improve.

    **In depth:**

    - Situation: a previously strong engineer starts missing commitments and reviews show quality problems.
    - Task: help them recover while protecting team delivery.
    - Action: a private conversation with concrete examples, asking what is going on. You learn of a personal issue plus unclear expectations after a role change. You agree specific goals, weekly check-ins and adjusted scope for a period.
    - Result: performance recovers within two months.
    - If it does not, move to a documented improvement plan with HR, fairly and transparently.

    **Follow-up they'll ask:** How do you protect the team meanwhile? Adjust assignments quietly so the critical path does not depend on that person, without public blame.
