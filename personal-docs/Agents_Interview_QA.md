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

??? question "How do you decide single-agent vs multi-agent?"
    Default to **single-agent** — fewer moving parts, easier to test and trace. Go
    **multi-agent (supervisor + specialists)** only when domains are genuinely
    distinct (different tools, context, or reasoning per domain) so separation
    improves reliability and each agent's prompt/tool set stays focused. Multi-agent
    adds routing errors, coordination latency, and more failure surface — justify it
    with real separation of concerns, not because it sounds sophisticated.

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
