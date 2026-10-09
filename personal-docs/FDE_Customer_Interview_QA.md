---
icon: material/handshake
---

# FDE Customer Interview Q&A — Senior & Scenario-Based

*Last reviewed: October 2026*

Senior questions for Forward Deployed Engineers and solutions engineers who work inside customer environments: discovery, scoping pilots, messy data, security reviews, failing pilots, scope control, exec demos, proving value and turning field work into product. Interviewers want judgement and structure, not just technical skill, so each answer shows how you would act and what you would measure.

## Core concepts

??? question "How do you run a discovery session with a new customer?"
    **Short answer:** Lead with their business problem, not your product: who feels the pain, what it costs today, how they will judge success, and what constraints will block you.

    **In depth:**

    - Prepare: read their filings or public material, know the attendees and their incentives.
    - Ask about the current workflow step by step, where time or money is lost, and what they have already tried.
    - Identify the economic buyer, the day-to-day user and the people who can say no, usually security, legal and IT.
    - Collect constraints early: data location, systems of record, cloud and network rules, timelines.
    - End by playing back the problem in their words and agreeing next steps in writing.

    **Follow-up they'll ask:** What is the most common discovery mistake? Demoing too early, which turns the meeting into a feature conversation before you understand the problem.

??? question "How do you scope a proof of concept so it can actually succeed?"
    **Short answer:** Pick one narrow, high-value use case, define measurable success criteria with the customer in writing, fix the timebox, and secure data and access before the clock starts.

    **In depth:** A good POC has a single workflow, a named business owner, a baseline metric and a target, for example reducing analyst review time per case from 40 minutes to 15. Write a short success plan covering scope, out-of-scope items, data needed, environment, who does what, the timeline and the decision that follows if criteria are met. Make data access and security approval a prerequisite, because most POCs die waiting for credentials. Avoid open-ended explorations that cannot produce a yes or no. Agree up front what happens on success: a paid pilot, production rollout or contract.

    **Follow-up they'll ask:** How long should it be? Usually two to six weeks; long enough to touch real data, short enough to keep executive attention.

??? question "A customer says 'we want AI for our support team'. How do you turn that into requirements?"
    **Short answer:** Decompose the vague ask into specific jobs, pick the one with the clearest value and data, and write requirements as measurable outcomes plus constraints.

    **In depth:**

    - Shadow the support team or review real tickets to see where time goes: triage, searching knowledge, drafting replies, escalation.
    - Quantify each: volume, handle time, error cost.
    - Pick the candidate where data exists and risk is manageable, often agent-assist drafting before full automation.
    - Write requirements as outcomes, such as draft accepted with minor edits in 60 percent of cases, plus latency, languages, systems to integrate, audit needs and failure handling.
    - Define what the system must never do, like issuing refunds without a human.
    - Confirm priorities with the business owner and record open questions.

    **Follow-up they'll ask:** How do you handle conflicting stakeholder asks? Make the trade-off visible and have the business owner decide, then document it.

??? question "How do you integrate with messy customer data and legacy systems?"
    **Short answer:** Profile the data before designing anything, integrate through the least invasive interface available, and build validation and reconciliation in from day one.

    **In depth:** Start by profiling: completeness, duplicates, inconsistent IDs, free-text fields, and how data really flows versus how the diagram says it flows. Prefer existing interfaces such as APIs, database replicas, exports or event streams over direct writes to production systems. For mainframes or old ERPs, a nightly extract may be the honest first step. Add a thin adapter layer so legacy quirks stay out of your core logic. Build data quality checks and reconciliation counts so you can prove nothing was lost. Document assumptions and get customer data owners to sign off on mapping rules, because they own the semantics.

    **Follow-up they'll ask:** What if the data is too poor for the use case? Say so early with evidence, and propose a smaller scope or a data clean-up step.

??? question "How do you get through a customer's security review quickly?"
    **Short answer:** Engage security early, come prepared with standard documentation and a clear data flow diagram, and treat their reviewers as partners rather than obstacles.

    **In depth:**

    - Bring the standard pack: SOC 2 or ISO reports, pen test summary, completed security questionnaire, data processing agreement.
    - Draw a precise data flow: what data leaves their environment, where it is stored, retention, encryption and who can access it.
    - For AI use cases, answer directly whether data is used for model training, how prompts are logged, and how outputs are filtered.
    - Offer deployment options that reduce risk, such as running in their VPC, private networking, customer-managed keys or redaction.
    - Track open questions in a shared list with owners and dates.

    **Follow-up they'll ask:** What if they demand something you cannot support? Escalate to product with the deal context, and offer compensating controls in the meantime.

??? question "How do you measure and present the value of a deployment?"
    **Short answer:** Agree on a baseline before you start, measure the same metric after, convert the difference into money or risk reduction, and let the customer validate the numbers.

    **In depth:** Typical value levers are time saved, throughput increased, errors avoided, revenue gained or risk reduced. Capture a baseline with the customer, for example average handle time across a month of tickets. After deployment, measure the same metric on comparable work, ideally with a control group. Translate into money: hours saved times loaded cost, minus total cost of the solution, gives a clear ROI and payback period. Include adoption metrics, because value requires usage. Be conservative and show your assumptions; an inflated ROI that finance tears apart destroys credibility.

    **Follow-up they'll ask:** What if the value is qualitative? Use structured user surveys and specific stories, but still tie them to a business outcome the sponsor cares about.

??? question "How do you hand over a deployment to the customer's own team?"
    **Short answer:** Plan the handover from day one: pair with their engineers during the build, document operations, and transfer ownership in stages with a clear support model after.

    **In depth:**

    - Identify the customer owner early and involve them in design and code reviews.
    - Deliver runbooks, architecture docs, a monitoring dashboard and alert routing.
    - Run a shadow period where they handle incidents and changes while you watch, then reverse roles.
    - Agree in writing what you support afterwards, response times and escalation paths.
    - Define a handover checklist and get sign-off.

    **Follow-up they'll ask:** What is the sign that handover failed? The customer still calls you for routine changes three months later.

??? question "How do you turn field work into product improvements?"
    **Short answer:** Separate one-off customer hacks from repeatable patterns, bring product the evidence across accounts, and contribute generalised solutions rather than raw custom code.

    **In depth:** Keep a running log of gaps, workarounds and requests, tagged by account, deal size and frequency. When the same workaround appears at three customers, it is a product signal. Write a short brief for product: the problem, affected accounts and revenue, the workaround you built, and a proposed general design. Where possible, build field code against product extension points so it can be upstreamed. Join roadmap reviews and be honest about which asks are niche. FDE teams that only build custom code create a long tail of unsupported deployments.

    **Follow-up they'll ask:** How do you handle a product team that ignores you? Quantify the cost in field hours and lost deals, and bring a customer to talk to them directly.

## Scenarios

??? question "Three weeks into a six-week pilot, the results are poor and the customer is losing confidence. What do you do?"
    **Short answer:** Diagnose honestly and fast, tell the sponsor the truth with a recovery plan, and narrow scope to something you can win rather than hoping the last weeks fix it.

    **In depth:**

    - Find the root cause: bad or missing data, wrong use case, unclear success criteria, model limitations, or low user engagement.
    - Meet the sponsor proactively with the facts, what you have learned and two options, such as narrowing to the segment where results are strong or fixing a data issue with their help.
    - Reset success criteria in writing if the original ones were unrealistic.
    - Increase cadence: short daily check-ins with users, weekly sponsor updates.
    - If it truly cannot work, say so and end cleanly; credibility survives a fair no.

    **Follow-up they'll ask:** How would you avoid this next time? Validate data quality and a quick baseline in week one before committing to the full plan.

??? question "A customer keeps adding requirements to a fixed-scope engagement. How do you handle it?"
    **Short answer:** Acknowledge each ask, capture it in a visible backlog, show its impact on the timeline, and make the sponsor choose what to trade rather than silently absorbing it.

    **In depth:** Scope creep usually comes from real needs discovered mid-project, so do not dismiss them. Log each request, estimate it and show the trade-off: adding this pushes the go-live by two weeks or replaces another item. Bring it to the agreed decision-maker, not just the person asking. Offer a phase two for good ideas that do not fit. Saying no is easier when the original success plan is written and agreed. Watch your own team too; engineers often say yes to small asks that add up.

    **Follow-up they'll ask:** What if a senior executive asks directly? Thank them, explain the trade-off in business terms and confirm the decision with the sponsor in writing.

??? question "You have 20 minutes to demo to a customer's executive team. How do you prepare and run it?"
    **Short answer:** Build the demo around their problem and their data, lead with the outcome, keep it short, and have a fallback if anything fails live.

    **In depth:**

    - Find out beforehand what each executive cares about: cost, revenue, risk or speed.
    - Open with the business problem and the result in one slide, then show the workflow.
    - Use their data or realistic data in their terminology; generic demos land poorly.
    - Show one or two moments of clear value rather than every feature.
    - Rehearse, pre-load the environment and keep a recorded backup.
    - Leave time for questions and end with a specific ask or next step.

    **Follow-up they'll ask:** What if the demo breaks live? Stay calm, switch to the recording, and offer a follow-up session; do not debug in front of executives.

??? question "You are on site and the integration fails in front of the customer's engineers. How do you debug it?"
    **Short answer:** Stay calm and methodical, narrate your reasoning, isolate the failing layer from network to auth to data, and timebox before switching to a workaround.

    **In depth:** Start with what changed between your test environment and theirs: proxies, firewalls, TLS inspection, certificates, DNS, service account permissions and data formats are the usual suspects. Reproduce with the smallest possible call, such as a direct request from the same host. Read the logs on both sides and ask their engineers for help; they know the environment. Keep notes of what you tried. If it takes longer than expected, agree a workaround or a follow-up with a clear owner. Afterwards, add the failure to your pre-deployment checklist.

    **Follow-up they'll ask:** How do you keep trust in that moment? Being transparent and structured builds more trust than pretending it is fine.

??? question "You are supporting four accounts and all of them want your time this week. How do you prioritise?"
    **Short answer:** Rank by business impact and urgency using agreed criteria, communicate clearly to the accounts you defer, and escalate to your manager when the trade-off is a business decision.

    **In depth:**

    - Consider production incidents first, then contractual deadlines, then revenue at stake and renewal or expansion timing.
    - Look for work you can unblock quickly for one account so it can proceed without you.
    - Delegate to colleagues or partner teams where possible, with a proper handoff.
    - Tell deferred accounts when you will get to them and keep that promise.
    - Raise chronic overload with your manager with data on hours per account.

    **Follow-up they'll ask:** What if two accounts are equally critical? Escalate to account leadership for the call; it is a business decision, not one for you to make silently.

??? question "Tell me about a time you had to say no to a customer."
    **Short answer:** Use STAR: explain the request, why it was the wrong thing to build, how you said no while offering an alternative, and the outcome for the relationship.

    **In depth:**

    - Situation: a customer asks for a custom feature, such as letting an AI agent write directly to their ERP without approval.
    - Task: protect the customer and the deployment without losing the deal.
    - Action: explain the risk in their terms, show data on error rates, and propose a human-approval step for high-value actions with automation for low-risk ones.
    - Result: they accept the phased approach, go live safely and later expand automation based on measured accuracy.
    - Close with what you learned, such as framing a no as a safer path to the same goal.

    **Follow-up they'll ask:** What if they insist? Escalate with your leadership and document the risk; some deals are not worth a dangerous deployment.
