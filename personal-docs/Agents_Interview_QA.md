---
icon: material/robot-industrial
---

# Agentic AI / Agents Interview Q&A — Advanced

*Last reviewed: October 2026*

Deep, senior-level questions on agent systems: architectures, planning, memory,
tool use, multi-agent orchestration, failure modes, evaluation, and running
agents in production. Assumes you know the basics (this is the depth layer).

!!! tip "How to use this page"
    Skim the **60-second talking points** and **rapid-fire** for recall, then
    drill into the collapsible questions. Finish with the **self-quiz**.
    Deep dives: [Agent Engineering](../GenAI-Topics/agent-engineering/index.md) ·
    [LangGraph](../GenAI-Topics/langgraph/index.md) ·
    [A2A Communication](../GenAI-Topics/a2a/index.md) ·
    [MCP Interview Q&A](MCP_Interview_QA.md).

---

## Study checklist

Can you explain each without notes?

- [ ] The agent loop and where each step can fail
- [ ] ReAct vs plan-and-execute vs reflection
- [ ] Short-term vs long-term vs episodic memory, and context engineering
- [ ] Tool design for reliability (schemas, least privilege, gating)
- [ ] Single-agent vs supervisor/multi-agent trade-offs
- [ ] Orchestration as a state machine / graph (LangGraph)
- [ ] Agent failure modes and how to contain each
- [ ] How to evaluate an agent (trajectory + outcome)
- [ ] Guardrails, HITL, and least-privilege execution
- [ ] Cost/latency control and determinism where it matters

---

## 60-second talking points

- **"An agent is an LLM in a loop with tools and a stopping condition."** Plan →
  act → observe until done or capped. Everything hard is in the loop control.
- **"Reliability comes from constraints, not cleverness."** Narrow tools, step
  caps, guardrails, HITL for writes, and tracing — not a smarter prompt.
- **"Only go multi-agent when domains genuinely differ."** Coordination has a
  cost; a well-scoped single agent beats a fragile crowd.

---

## Core concepts — simple, then the nuance

??? note "The agent loop: explain it simply, then go deep"
    **Simple:** The model looks at the goal and current state, decides the next
    action (often a tool call), the system runs it, feeds the result back, and
    repeats until the model says it's done.

    **The nuance:** Each turn is a full LLM inference over accumulated context, so
    the loop drives cost, latency, and drift. Failure points: bad **plan**
    (misreads the goal), wrong **tool/args**, misinterpreting **observations**, and
    never **terminating**. Production loops add a step/iteration cap, a token/cost
    budget, repeated-action detection, timeouts, and an explicit termination signal.

??? note "Planning strategies: simple, then deep"
    **Simple:** Some agents decide one step at a time (ReAct); others make a full
    plan up front, then execute it.

    **The nuance:** **ReAct** (reason+act, interleaved) adapts to observations but
    can wander. **Plan-and-execute** front-loads a plan (cheaper, more predictable,
    parallelizable) but is brittle if reality diverges — so it re-plans on failure.
    **Reflection** adds a self-critique pass to catch errors. Choose by how dynamic
    the environment is: dynamic → ReAct/re-plan; stable multi-step → plan-execute.

---

## Architecture & planning

=== "The loop as a state machine"

    ```text
    START → plan → act(tool) → observe → decide
                       ↑___________________|   (loop, capped)
    decide → {continue | reflect | finish | escalate-to-human}
    guards: step_cap, token_budget, timeout, repeated_action_detector
    ```

=== "Supervisor + specialists"

    ```text
    User → Supervisor (route/plan/compose)
             ├─ Data Agent      (SQL / warehouse tool)
             ├─ Document Agent  (retrieval / RAG tool)
             └─ Action Agent    (write tool, gated)
    Specialists return to supervisor; supervisor composes cited answer.
    ```

??? question "ReAct vs plan-and-execute vs reflection — when do you use each?"
    **ReAct** interleaves reasoning and acting, adapting each step to the last
    observation — best for **dynamic** environments but can loop/wander. **Plan-and-
    execute** builds a plan up front, then runs it — cheaper, more predictable,
    parallelizable, but brittle if reality diverges, so pair it with **re-planning**
    on failure. **Reflection** adds a critique/revision step to catch mistakes before
    finishing — worth it for high-stakes output, at extra cost. Real systems often
    combine them (plan, act with ReAct-style steps, reflect at the end).

??? question "Beyond ReAct: what are tree-of-thoughts and routing, and when are they worth it?"
    **Tree-of-thoughts** explores several candidate reasoning paths, scores them,
    and keeps the best. It can help on puzzles and planning problems with clear
    ways to judge a partial answer, but it multiplies model calls, so it is rarely
    worth it for everyday business tasks. **Routing** sends each request to the
    right model, prompt or specialist agent (a cheap model for simple questions,
    a stronger one or a specialist for hard ones). It is one of the most useful
    patterns in production because it cuts cost and latency. Judge both the same
    way: run them on your evaluation set and keep them only if quality gains
    justify the extra cost.

??? question "How do you decide single-agent vs multi-agent?"
    Default to **single-agent** — fewer moving parts, easier to test and trace. Go
    **multi-agent (supervisor + specialists)** only when domains are genuinely
    distinct (different tools, context, or reasoning per domain) so separation
    improves reliability and each agent's prompt/tool set stays focused. Multi-agent
    adds routing errors, coordination latency, and more failure surface — justify it
    with real separation of concerns, not because it sounds sophisticated.

??? question "How do you choose an agent framework?"
    Start from the task and your constraints, not popularity. Many tasks need
    **no framework**: a model API, a few tools and a short loop are easier to test
    and debug. Reach for a framework when you need what it gives you, such as
    durable state and checkpoints, pause and resume for human approval, streaming,
    tracing or multi-agent coordination. Options differ in style: graph-based
    orchestration with explicit state (LangGraph), role-based agent teams
    (CrewAI), lightweight SDKs from model providers, document-heavy toolkits
    (LlamaIndex), cloud-native kits tied to one platform, and type-safe Python
    libraries. Check that it works with the models you need, supports MCP and
    your tools, has tracing and evaluation hooks, and is actively maintained.
    Whatever you pick, understand the plain agent loop first so you can debug
    what the framework does for you.

??? question "Walk me through your agent project's architecture. Why that design and framework?"
    Interviewers want your reasoning, not a tour of features. Cover, in order:
    the **problem and users**; the **flow** from request to answer (input checks,
    planning, tools, memory, output checks); the **tools** and their permissions
    (read vs write, approvals); **state and memory**; how you **evaluated** it
    (task success, trajectory checks, cost per task); and how it runs in
    **production** (tracing, limits, fallbacks). Then the **alternatives** you
    considered and why you rejected them (a simple workflow, a single agent, a
    different framework), and **one thing you would change** now. Use your own
    real project; if it was a prototype, say so and explain what production
    would need.

??? question "Why model agent orchestration as a graph/state machine (e.g. LangGraph)?"
    A raw while-loop hides state and makes branching, retries, human-in-the-loop
    pauses, and cycles hard to reason about. A **graph** makes nodes (steps) and
    edges (transitions/conditions) explicit, supports **checkpointing** (pause/resume,
    durable state), conditional routing, parallel branches, and clean loops with
    exit conditions. It turns "prompt engineering a loop" into an inspectable,
    testable control-flow you can trace and recover.

??? question "How does a supervisor route to the right specialist reliably?"
    Give the supervisor a **clear tool/agent catalog** with crisp descriptions of
    each specialist's scope, and constrain routing to structured output (pick from an
    enum, not free text). Add a fallback ("unclear → ask a clarifying question"),
    validate the route, and trace it so misroutes are visible. Keep specialist
    boundaries non-overlapping so the choice is unambiguous.

??? question "Walk me through the layers of an AI agent, from request to result."
    **Input** cleans, validates and extracts what arrives (text, files, events)
    and marks outside content as data, not instructions. **Reasoning** (an LLM
    plus a pattern such as ReAct, plan-and-execute or a router) decides the next
    step. **Memory** supplies context beyond one call: the conversation, retrieved
    facts, the user profile. **Tools** reach live data and other systems.
    **Action** does the chosen step: reply, write, notify, hand off. **Output**
    shapes the result for a person or a program (schema, citations). **Feedback**
    checks it (code checks, a judge, the user) and either retries, re-plans or
    stores what was learned. The loop between reasoning and tools, plus feedback,
    is what makes it an agent rather than a single model call.

??? question "What belongs in the input layer of an agent, and why does it matter?"
    Format conversion (OCR, speech to text, payload parsing), validation (types,
    size limits, required fields, with clear errors instead of guessing), privacy
    (mask data you shouldn't keep) and extraction of the intent and IDs. It is also
    the first prompt-injection defence: text from documents, web pages, emails or
    tools is labelled as data and never followed as instructions. Bad input
    handling shows up later as wrong tool calls and invented answers.

??? question "How do you design the action layer so an agent can't do something harmful by mistake?"
    Order actions by risk: reply, draft for approval, write inside the agent's own
    system, change something that matters elsewhere. The riskier the action, the
    more it needs: narrow permissions, policy checks in code, idempotency so a
    retry can't repeat it, an audit log, a way to undo, and human approval above a
    threshold. Ask a clarifying question instead of acting when the request is
    ambiguous and a wrong guess is costly.

??? question "What does the feedback layer do in an agent, and how do you keep it from looping forever?"
    It checks each result and turns the outcome into improvement: code checks
    (schema valid, query ran, totals add up), an LLM judge for qualities code can't
    test, and user signals such as corrections or thumbs down. A failed check
    triggers a retry with a changed approach or a re-plan; lasting preferences go
    to memory. Cap retries at two or three, then return a clear message or hand
    off to a person. Offline, collect failures into an eval set and fix the cause.

??? question "Design a basic agent from scratch. What do you decide, in what order?"
    1) The task in one sentence and what "done" means. 2) Inputs and their limits.
    3) The reasoning pattern plus step, time and cost limits. 4) The minimum memory
    needed. 5) The smallest tool set, reads separate from writes, and which actions
    need approval. 6) The output format for each consumer and the "I don't know"
    path. 7) Feedback before launch: code checks, a retry cap, an eval set of real
    tasks and tracing for every step.

---

## Memory & context

??? question "What kinds of memory does an agent need, and how do you manage the context budget?"
    **Short-term** (the running scratchpad/conversation), **long-term** (durable
    facts/preferences, often in a vector or key-value store, retrieved on demand),
    and **episodic** (summaries of past sessions/tasks). The context window is a
    budget: keep the system prompt + current task + *retrieved* relevant memory +
    recent turns, and **compact** older history into summaries. Don't stuff
    everything — irrelevant context degrades reasoning (distraction,
    lost-in-the-middle) and costs tokens.

??? question "An agent 'forgets' earlier steps in a long task. What's happening and how do you fix it?"
    The relevant info fell out of the context window (truncation) or was buried in
    the middle of a long context the model underweights. Fixes: **summarize/compact**
    completed steps into a running state object, persist key facts to **external
    memory** and retrieve them when needed, keep a structured **scratchpad** of
    decisions/results rather than raw transcript, and checkpoint state so it survives
    across turns. Design the loop to carry a compact state, not the whole history.

??? question "What is context engineering, and how is it different from prompt engineering?"
    Prompt engineering tunes the instructions; **context engineering** designs
    *everything* that lands in the window on each turn: system prompt, tool
    definitions, retrieved documents, memory, prior tool results and the
    conversation. For long-running agents it is the main reliability lever. Core
    techniques: **just-in-time retrieval** (give the agent search/read tools and
    lightweight references such as file paths or IDs instead of pre-loading
    everything); **compaction** (summarize old turns and clear stale tool results
    while keeping decisions and open issues); **structured note-taking** (the agent
    writes a progress/todo file outside the window and re-reads it); **sub-agents**
    with clean windows that return condensed results; and **small, non-overlapping
    tool sets** (every tool definition costs tokens and adds selection confusion).
    Order stable content first so **prompt caching** hits. Measure it: track
    tokens per step and task success as the context grows, since quality degrades
    well before the hard limit ("context rot").

??? question "How do you give an agent durable memory across sessions?"
    Persist facts/outcomes to an external store (vector DB for semantic recall,
    key-value for structured facts) keyed by user/task; at the start of a session,
    retrieve relevant memories into context; write back new learnings at the end.
    Add decay/relevance filtering so memory stays useful, and never treat retrieved
    memory as trusted instructions (injection risk).

---

## Tools & execution

=== "Reliable tool contract"

    ```python
    @tool
    def run_report(region: str, quarter: str) -> dict:
        """Return revenue by product for a region+quarter. READ-ONLY.
        region in {'US','EU','APAC'}; quarter like '2026Q1'.
        Returns {rows:[...], sql_used:'...'} — trimmed, structured."""
        ...
    ```

??? question "What makes agent tools reliable vs a source of failure?"
    Reliable tools are **narrow**, have **typed schemas** with validated args, clear
    **descriptions** (the model reads them as instructions), **least privilege**
    (read vs write separated, writes gated), and return **minimal structured** output
    (not raw dumps that blow the context or confuse the model). Unreliable tools are
    broad, vaguely described, return huge payloads, or let the model trigger
    destructive actions without validation. Validate server-side, don't trust the
    model to self-limit.

??? question "How do you let an agent take write/destructive actions safely?"
    **Human-in-the-loop** approval for destructive ops (the agent proposes, a person
    confirms), or a **policy gate** that checks the action against rules before
    execution. Validate arguments and enforce constraints server-side, make
    operations **idempotent** (safe to retry), scope credentials to least privilege,
    and **log/trace** every action. The agent flags and drafts; the guarded execution
    layer decides.

??? question "How do you handle a tool that fails, times out, or returns garbage?"
    Treat tool calls like any unreliable dependency: timeouts, **retries with
    backoff** for transient errors, and a structured error the agent can reason over
    ("tool failed: reason") so it can retry differently or escalate. Guard against
    loops of the same failing call (detect repeats, cap attempts). Never let a
    failure silently produce a confident wrong answer — surface it.

---

## Failure modes & guardrails

??? question "What are the classic agent failure modes and how do you contain each?"
    - **Infinite/looping** → step cap, repeated-action detection, cost budget.
    - **Goal drift** (wanders off task) → re-anchor to the goal each turn, reflection.
    - **Wrong tool / bad args** → typed schemas, validation, tool-choice constraints.
    - **Prompt injection** via tool/retrieved content → treat as data, gate writes.
    - **Hallucinated success** → verify outcomes against real state, require evidence.
    - **Runaway cost/latency** → budgets, model routing, caching.
    - **Cascading multi-agent errors** → validate hand-offs, bound delegation depth.

??? question "How do you defend an agent against prompt injection through tools/retrieval?"
    Treat **all** tool output and retrieved content as **untrusted data, not
    instructions**; the system prompt instructs the model to ignore embedded
    directives. Separate trusted instructions from untrusted context structurally,
    **gate** any privileged/write action behind validation or approval regardless of
    what the content says, and scope tool credentials so a compromised instruction
    can't do damage. Injection is contained by *least privilege + gating*, not by
    prompt wording alone.

??? question "Where does human-in-the-loop belong in an agent system?"
    At **high-consequence, low-reversibility** decision points: destructive writes,
    financial actions, external communications, anything hard to undo. The agent does
    the analysis and proposes; a human approves/edits/rejects. Also use HITL as a
    fallback when confidence is low or the agent is stuck. Cheap, reversible reads
    don't need it — reserve human attention for where it matters.

---

## Evaluation & production

=== "Evaluate trajectory + outcome"

    ```text
    Outcome eval:    did it reach the correct final answer/state?
    Trajectory eval: were the steps/tool calls sensible and efficient?
    Component eval:  routing accuracy, tool-arg validity, retrieval recall
    Ops:             steps-per-task, cost/task, latency, success rate
    ```

??? question "How do you evaluate an agent — it's not just 'right answer'?"
    Two levels: **outcome** (did it reach the correct result/state?) and
    **trajectory** (were the steps and tool calls sensible, or did it flail and get
    lucky?). Build a labeled task set, score outcome correctness plus efficiency
    (steps/tool-calls per task), and eval components separately: routing accuracy,
    tool-argument validity, retrieval recall. Use **LLM-as-judge** with a rubric for
    trajectory quality, human-calibrated. Track success rate, cost/task, and
    latency over time to catch regressions.

??? question "Design an evaluation harness for a production agent. What goes in it?"
    1. **Task suite** from real traffic and incidents: input, environment
       state, and a *checkable* success criterion (final DB state, test pass, a
       rubric), not just a reference string. Include adversarial and
       prompt-injection cases.
    2. **Graders** in order of preference: code-based checks of the end state,
       then LLM-as-judge with a rubric (calibrated against human labels and
       re-checked when you change the judge model), then human review for a
       sample.
    3. **Multiple trials per task** because agents are non-deterministic: report
       pass@k (succeeds at least once) and pass^k (succeeds every time), since
       production reliability needs the second.
    4. **Trajectory metrics:** tool-call accuracy, wasted steps, policy
       violations, cost and latency per task.
    5. **Sandboxed, reset environments** so runs are isolated and repeatable.
    6. **Gates:** run offline in CI on every prompt/model/tool change, then
       shadow or canary online with tracing; feed production failures back
       into the suite.
    Watch for eval contamination (tasks leaked into prompts) and graders that
    reward a plausible narrative over a verified outcome.

??? question "How do you make an agent's behavior reproducible enough to debug?"
    **Trace every step** (inputs, chosen action, tool args, observation, tokens),
    pin model versions, lower temperature where determinism matters, and persist the
    state at each node (checkpointing) so you can replay from a point. Deterministic
    tools + captured traces let you reproduce a bad run and see exactly which step
    went wrong, instead of "it sometimes fails."

??? question "How do you control cost and latency in an agent?"
    **Step/iteration caps** and a **per-task token budget**; **model routing** (small
    model for routing/simple steps, big model for hard reasoning); **caching**
    (semantic + tool-result); **parallelize** independent sub-tasks; trim context
    aggressively (compact history, retrieve less). Prefer a **fixed chain** over an
    agent when the path is knowable — the cheapest agent step is the one you didn't
    need to take. In 2026 the biggest levers are usually **prompt caching** (keep
    the system prompt and tool definitions stable and first; cached input is billed
    at a fraction of the normal rate), the **batch** APIs for offline work (roughly
    half price), **reasoning-effort / thinking-budget** settings on reasoning
    models, and trimming the tool catalog. Report **cost per successful task**, not
    cost per call, so a cheap model that needs three retries doesn't look like a
    win.

??? question "You're productionizing an agent that sometimes takes destructive actions incorrectly. Design the safeguards."
    Layered: (1) **least-privilege tools** — the agent can't call the destructive op
    directly; it calls a *propose* tool. (2) **Validation/policy gate** checks the
    proposal against rules. (3) **HITL approval** for anything irreversible. (4)
    **Idempotent, logged** execution so retries are safe and everything is auditable.
    (5) **Outcome verification** — confirm the action's effect against real state. (6)
    **Circuit breaker** — halt the agent if it repeats failing/blocked actions. The
    LLM decides *what to propose*; a deterministic guarded layer decides *what
    actually runs*.

---

## Rapid-fire

| Q | A |
|---|---|
| Agent loop? | plan → act → observe, until done or capped |
| ReAct? | interleave reasoning + acting each step |
| Plan-and-execute? | plan up front, then run (re-plan on failure) |
| Reflection? | self-critique/revise before finishing |
| Single vs multi-agent? | single by default; multi only for distinct domains |
| Why a graph (LangGraph)? | explicit state, branching, checkpointing, loops |
| Memory types? | short-term, long-term (external), episodic (summaries) |
| Stop runaway loops? | step cap + cost budget + repeated-action detection |
| Biggest safety risk? | injection via tool/retrieved content → gate writes |
| Eval an agent? | outcome + trajectory + component metrics |
| HITL belongs where? | high-consequence, low-reversibility actions |
| Cheapest agent step? | the one you didn't need (use a fixed chain) |
| Context engineering? | curating everything in the window each turn |
| pass@k vs pass^k? | succeeds once in k tries vs every time in k tries |
| Agent ↔ tools standard? | MCP; agent ↔ agent: A2A |

---

## Pitfalls interviewers probe

- Reaching for multi-agent when a scoped single agent (or fixed chain) works.
- No step cap / budget → runaway loops and cost.
- Stuffing full history into context instead of compacting to a state object.
- Trusting tool/retrieved content as instructions (injection).
- Letting the model call destructive tools directly (no gate/validation).
- Evaluating only final answers, ignoring trajectory quality.
- Non-reproducible runs (no tracing, no version pinning) → undebuggable.

---

## Self-quiz

1. Walk through the agent loop and name a failure mode at each step.
2. ReAct vs plan-and-execute vs reflection — pick one per scenario and justify.
3. When is multi-agent worth the coordination cost?
4. Why model orchestration as a graph instead of a while-loop?
5. An agent forgets earlier steps in a long task — diagnose and fix.
6. Design safe execution for an agent that can take destructive actions.
7. How do you evaluate an agent beyond "was the answer right"?
8. Four levers to cut an agent's cost and latency.
9. How do you make a flaky agent run reproducible enough to debug?
10. How do you contain prompt injection arriving through a tool result?
11. What would you put in an agent's context on turn 50 of a long task, and what would you drop?
12. Why report pass^k rather than a single-run success rate for a customer-facing agent?

!!! note "Cross-links"
    Deep dives: [Agent Engineering](../GenAI-Topics/agent-engineering/index.md) ·
    [LangGraph](../GenAI-Topics/langgraph/index.md) ·
    [A2A Communication](../GenAI-Topics/a2a/index.md) ·
    Related: [AI Engineer Interview Q&A](AI_Engineer_Interview_QA.md) ·
    [MCP Interview Q&A](MCP_Interview_QA.md)

??? question "LLMs vs agents — when do you use each?"

    **Short answer:** A plain LLM call answers in one step; an agent loops — plans, calls tools, checks results and decides what to do next. Use the simplest architecture that fits, because the loop costs latency, money and predictability.

    **In depth:** Use a single LLM call when the task is one transformation: classify, summarise, extract, draft, translate — deterministic, fast, easy to evaluate. Use a fixed workflow (LLM calls in a set sequence) when the steps are known in advance, such as retrieve, then draft, then check — you keep control and the model does not choose the path. Use an agent when the number and order of steps cannot be known upfront, the task needs tools or external actions, and the result of one step decides the next — research, multi-system tasks, troubleshooting. Avoid an agent when errors compound, actions are irreversible, or you cannot evaluate the outcome — more autonomy on an unreliable task just fails more creatively. Example: "Summarise this ticket" is one LLM call; "Resolve this billing dispute across the CRM, billing system and email" is an agent, with human approval before any refund is issued.

    **Follow-up they'll ask:** What does the agent loop actually cost you? Extra model calls, context re-sent every step, and nondeterministic behaviour that is harder to test.

??? question "Why is the agent so slow?"

    **Short answer:** An agent is many LLM calls in a loop, so a chatbot's latency problems multiply — count the calls, then the cost per call, then the wasted loops.

    **In depth:** Too many steps: each plan, tool choice, observation and reflection is another model call, and ten steps at 2 seconds each is 20 seconds before any tool time — cap steps, combine decisions, and use a fixed workflow where the path is known. Context re-sent every step: the full history, tool results and reasoning are reprocessed on each call, so later steps are slower than early ones — summarise history, prune tool outputs, and prompt-cache the stable prefix. Sequential tools: independent tool calls run one after another — call independent tools in parallel, cache tool results, and add timeouts so one slow API does not stall the run. Retries and loops: the agent re-tries a failing tool or loops without progress detection — set retry limits, loop detection, and a clear stopping condition. Wrong model for the job: a frontier model for every routing decision is slow and expensive — use a small, fast model for planning and routing steps and the strong model only for the hard reasoning. Example: a research agent taking 90 seconds was making 14 model calls and re-sending 30,000 tokens each time — summarising after each source and parallelising source fetches cut it to under 30 seconds with the same model.

    **Follow-up they'll ask:** How do you know the agent is looping rather than working? Track steps taken, repeated tool calls with the same arguments, and time per step — and stop on a limit, not on hope.

??? question "Choose RAG or agents — how do you decide?"

    **Short answer:** RAG answers "what do the documents say?" and an agent answers "work through these steps and do something" — decide by knowledge vs action, fixed vs unknown steps, and read-only vs side effects.

    **In depth:** Choose RAG when the user needs accurate answers grounded in a specific, changing knowledge base, with citations — policy Q&A, support, document search; read-only, predictable, easier to evaluate. Choose an agent when the task needs multiple steps, tools or systems, decisions along the way, or real actions — booking, updating records, running an investigation. Choose a workflow in the middle when steps are known but each step needs language understanding — the most common production answer, and the one interviewers want to hear you consider. Use both when the agent needs knowledge: retrieval becomes one of the agent's tools, so "agent with RAG" is normal, not a contradiction. Decide on risk: side effects, irreversibility and evaluation difficulty all rise as you move from RAG to workflow to agent, so earn autonomy with evals and approvals. Example: "Answer questions from our manuals" is RAG; "Diagnose why this order is late and rebook the delivery" is an agent, using RAG over the delivery policy as one step, with approval before rebooking.

    **Follow-up they'll ask:** What if the task needs both knowledge and action? Retrieval as a tool inside the agent, with the agent's steps and approvals around it.
