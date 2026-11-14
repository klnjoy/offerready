---
icon: material/timeline-check
---

# Technical Program Manager Interview Q&A

*Last reviewed: November 2026*

Questions for technical program managers (TPMs) who run cross-team programs, including AI and data platform launches: planning, dependencies, risk, execution, communication and enough technical depth to be trusted by engineers. Behavioural answers follow STAR (Situation, Task, Action, Result), then what you learned. Use your own real programs.

See the [Technical Program Manager role guide](Path_Technical_Program_Manager.md) for the interview loop, rubric and a 14-day plan.

## The role

??? question "What does a TPM do that a project manager or engineering manager does not?"
    **Short answer:** A TPM owns delivery of a cross-team technical program end to end: the plan, dependencies, risks and communication, with enough technical depth to shape the approach, but without managing the engineers.

    **In depth:**

    - Project managers often track one team's schedule; a TPM works across many teams and systems.
    - Engineering managers own people and their team's execution; a TPM owns the program across teams.
    - Technical depth lets a TPM spot integration risks, challenge estimates and help design sequencing.

    **Follow-up they'll ask:** Give an example where your technical understanding changed the plan.

??? question "How do you lead without authority?"
    **Short answer:** Through clarity, trust and shared goals: make the program's purpose and each team's part obvious, keep commitments visible, and escalate on facts when needed.

    **In depth:** Agree goals with each team's lead so the program helps their goals too. Make ownership explicit. Be the most reliable person in the room: accurate status, early warnings, followed-up actions. Escalate only with options and a recommendation.

    **Follow-up they'll ask:** Tell me about a team that would not prioritise your program.

??? question "Tell me about a team that would not prioritise your program."
    **Short answer:** Understand their priorities and constraints first, find where the program helps their goals, offer options that reduce their cost, and escalate with facts only if the trade-off needs a higher decision.

    **In depth:** Often the team is not refusing; it has conflicting commitments. Make the conflict visible to the people who set both priorities, with the impact of each choice, so the decision is made deliberately rather than by default.

    **Follow-up they'll ask:** How did you keep the relationship good afterwards?

## Planning

??? question "How do you plan a large cross-team program?"
    **Short answer:** Start from the outcome and launch criteria, break the work into milestones per team, map dependencies to find the critical path, and plan the riskiest parts first.

    **In depth:**

    - Write the goal, scope, non-goals and what "launched" means.
    - Get each team to estimate its own work in ranges.
    - Map dependencies and the critical path.
    - Schedule risky unknowns early with spikes or prototypes.
    - Plan integration and testing time explicitly; it is where programs slip.

    **Follow-up they'll ask:** How do you handle a team that cannot commit to a date?

??? question "What is the critical path and why does it matter?"
    **Short answer:** The longest chain of dependent work that sets the earliest possible finish date; any delay on it delays the whole program.

    **In depth:** Knowing the critical path tells you where to focus attention, where adding help or parallelising might shorten the schedule, and which slips can be absorbed. It changes as work progresses, so re-check it regularly.

    **Follow-up they'll ask:** How would you shorten a critical path?

??? question "How do you estimate when teams are unsure?"
    **Short answer:** Use ranges with explicit assumptions, reduce the biggest unknowns early, and update the forecast as you learn.

    **In depth:** Ask for best, likely and worst cases and what drives the difference. Run short spikes on the unknowns. Communicate dates with a confidence level and the assumptions behind them.

    **Follow-up they'll ask:** Leadership wants one date. What do you give them?

??? question "How do you define scope and avoid scope creep?"
    **Short answer:** Write goals, non-goals and launch criteria up front, agree a change process, and make the cost of every new request visible before it is accepted.

    **In depth:** New requests are not banned; they are traded. For each one, show the impact on date, risk and other scope, and get the right owner to decide. Keep a log of decisions so nobody is surprised later.

    **Follow-up they'll ask:** A VP adds a "small" requirement late. What do you do?

??? question "A senior leader adds a requirement late. What do you do?"
    **Short answer:** Take it seriously, assess its impact on date, scope and risk with the teams, and bring the leader clear options rather than a yes or a no.

    **In depth:** Options include adding it and moving the date, swapping out other scope, or delivering it in a later phase. Confirm the decision in writing and update the plan and stakeholders.

    **Follow-up they'll ask:** What if they insist on everything by the same date?

## Dependencies and risk

??? question "How do you manage dependencies between teams?"
    **Short answer:** Make each dependency explicit with an owner, an interface and a date, get it into the other team's plan, and design so a late dependency does not block everything.

    **In depth:** Agree the contract (an API, a data schema, a capability) early. Build against mocks so work can proceed in parallel. Track dependencies in one place and review them on a regular cadence. Raise slips early with options.

    **Follow-up they'll ask:** How do you know a dependency is at risk before it slips?

??? question "How do you run a risk register?"
    **Short answer:** Keep a short, live list of risks with likelihood, impact, owner and mitigation, review it on a fixed cadence, and act on the top items.

    **In depth:** Many teams use a RAID log (risks, assumptions, issues, dependencies). A risk register only helps if it changes behaviour: the top risks should have mitigations in the plan. Close risks when they no longer apply and add new ones as you learn.

    **Follow-up they'll ask:** Name a risk you mitigated before it became an issue.

??? question "A dependency team is going to be late by a month. What do you do?"
    **Short answer:** Confirm the facts and the new date, assess impact on the critical path, generate options, and bring a recommendation to the decision-maker.

    **In depth:** Options include re-sequencing work, cutting or phasing scope, building a temporary workaround, lending help to the other team, or moving the launch. Present each with its cost and risk. Communicate the outcome to everyone affected.

    **Follow-up they'll ask:** Which of those options do you usually avoid, and why?

## Execution and launch

??? question "How do you track program status?"
    **Short answer:** A small number of milestones with clear exit criteria, a regular status update with red, amber or green and the reasons, and a single source of truth that teams actually update.

    **In depth:** Status should say what changed, what is at risk, and what decisions are needed. Avoid "90 percent done" by tracking milestones that are verifiable, such as an integration test passing in staging.

    **Follow-up they'll ask:** How do you spot a watermelon status (green outside, red inside)?

??? question "How do you plan a launch?"
    **Short answer:** Define launch criteria and a checklist covering functionality, reliability, security, support and rollback, then launch in stages with clear go or no-go decisions.

    **In depth:**

    - Readiness: testing, load and failure testing, monitoring and alerts, runbooks.
    - People: support, sales or customer teams briefed, documentation ready.
    - Rollout: feature flags, a small percentage first, then wider.
    - Rollback plan tested in advance.

    **Follow-up they'll ask:** What would make you call a no-go on launch day?

??? question "Tell me about a program that failed or slipped badly."
    **Short answer:** Own your part honestly, explain the cause, what you did to recover, and what you changed in how you run programs since.

    **In depth:** Interviewers want self-awareness and learning, not blame. Be specific about the signal you missed and the process change you made, such as earlier integration testing or a tighter dependency review.

    **Follow-up they'll ask:** What would you do differently if you ran it again?

## Communication

??? question "How do you communicate with executives versus engineers?"
    **Short answer:** Executives get the headline, risks, decisions needed and impact on goals; engineers get detail, context and clear asks.

    **In depth:** Write the executive summary first in any update. Keep the detail available, not in the headline. Use the same facts for every audience so stories never diverge.

    **Follow-up they'll ask:** How do you deliver bad news to an executive?

??? question "How do you run an effective program review meeting?"
    **Short answer:** Send status in writing beforehand, use the meeting only for risks, decisions and blockers, and end with owners and dates.

    **In depth:** Keep a standing agenda, timebox discussions, and capture decisions in a shared log. If a topic needs deep work, take it to a smaller group.

    **Follow-up they'll ask:** What do you do when a meeting keeps running over?

??? question "Two senior leaders disagree about the program's direction. What do you do?"
    **Short answer:** Lay out the options and trade-offs neutrally in writing, make sure both views are fairly represented, and get the decision to the right owner with a date.

    **In depth:** Your role is to make the decision possible and visible, not to win it. Identify who owns the decision. Share the impact of delay too, since indecision has a cost.

    **Follow-up they'll ask:** What if the decision owner will not decide?

## Technical depth and AI programs

??? question "How technical does a TPM need to be?"
    **Short answer:** Enough to understand the architecture, question estimates and integration plans, follow design discussions, and spot technical risk early.

    **In depth:** You should be able to sketch the system, explain the main components and their interfaces, and understand what makes a change risky. You are not the one writing the code, but engineers should trust your judgement on sequencing and risk.

    **Follow-up they'll ask:** Walk me through the architecture of a system from one of your programs.

??? question "Walk me through how you'd run a program to launch an AI assistant to customers."
    **Short answer:** Define the use case and launch quality bar, run model, data, product, security and support workstreams in parallel, and gate launch on evaluation results, safety review and a staged rollout.

    **In depth:**

    - Quality: an agreed evaluation set and target before launch, with a process for every model or prompt change.
    - Data: what sources it can use, access controls and freshness.
    - Safety: misuse testing, privacy and legal review, human escalation paths.
    - Operations: monitoring, cost limits, incident process.
    - Rollout: internal users, then a small customer group, then wider.

    **Follow-up they'll ask:** What is the biggest risk in this program, and how do you track it?

??? question "How is running an AI or ML program different from a regular software program?"
    **Short answer:** Quality is probabilistic and needs evaluation, outcomes can be uncertain, data is a major dependency, and operating cost and safety review add workstreams.

    **In depth:** Plan time-boxed experiments with decision points. Treat the evaluation set and data pipelines as deliverables. Add review steps for safety and privacy. Include cost forecasts for model usage in the launch criteria.

    **Follow-up they'll ask:** How do you put a date on an experiment?

??? question "How would you run a migration of many teams to a new data platform?"
    **Short answer:** Make the new platform clearly better, migrate in waves starting with willing teams, provide tooling and support, set a firm but fair deadline for the old platform, and track progress per team.

    **In depth:** Start with a pilot to prove value and fix gaps. Publish a migration guide and office hours. Measure adoption, not just announcements. Plan how and when the old system is turned off, including data retention and access.

    **Follow-up they'll ask:** What do you do with the last two teams that will not migrate?

??? question "What metrics would you use to judge a program's success?"
    **Short answer:** The outcome the program was for (adoption, reliability, revenue, cost), plus delivery measures such as milestones hit and quality at launch.

    **In depth:** Agree success measures at the start, not at the end. Separate output (it launched) from outcome (people use it and it solved the problem). Review them after launch, not just on launch day.

    **Follow-up they'll ask:** The program launched on time but nobody uses it. Was it a success?

??? question "Why do you want to be a TPM here?"
    **Short answer:** Connect your experience running cross-team technical work to this company's products and programs, with one or two specific reasons.

    **In depth:** Show you understand what the TPMs here work on, such as platform, AI or infrastructure programs, and what you would bring. Avoid generic answers.

    **Follow-up they'll ask:** What kind of program would you not enjoy running?
