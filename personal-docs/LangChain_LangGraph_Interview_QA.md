---
icon: material/link-variant
---

# LangChain / LangGraph Interview Q&A — Advanced

Senior questions on the LangChain ecosystem and LangGraph: chains vs graphs,
state and memory, tools, streaming, and productionizing. Assumes basics; this is
the depth layer. Study at a glance, then open each question for depth.

!!! tip "How to use this page"
    Skim the **60-second talking points** and **rapid-fire** for recall, then
    drill into the collapsible questions. Finish with the **self-quiz**.
    Deep dives: [LangChain](../GenAI-Topics/langchain/index.md) ·
    [LangGraph](../GenAI-Topics/langgraph/index.md) ·
    Related: [Agents](Agents_Interview_QA.md) · [AI Engineer](AI_Engineer_Interview_QA.md).

---

## Study checklist

Can you explain each without notes?

- [ ] What LangChain is (and isn't) vs the raw model API
- [ ] LCEL / composition and why it matters
- [ ] Chains vs agents vs graphs
- [ ] LangGraph state, nodes, edges, conditional routing
- [ ] Checkpointing / persistence and human-in-the-loop
- [ ] Memory options and their limits
- [ ] Tools / structured output
- [ ] Streaming tokens and intermediate steps
- [ ] Tracing/eval (LangSmith) and why
- [ ] When NOT to use the framework

---

## 60-second talking points

- **"LangChain is orchestration glue; the LLM is the engine."** It standardizes
  models, prompts, tools, retrievers, and memory so you compose instead of wiring.
- **"LangGraph adds durable, cyclic state machines."** When you need loops,
  branching, persistence, and human-in-the-loop, a graph beats a linear chain.
- **"Reach for the framework for speed, drop it when it hides too much."** Thin
  needs may not need it.

---

## Core concepts — simple, then the nuance

??? note "LangChain vs LangGraph: explain it simply, then go deep"
    **Simple:** LangChain helps you build a **pipeline** of LLM steps and tools.
    LangGraph helps you build a **stateful loop/graph** where the flow can branch,
    cycle, pause, and resume.

    **The nuance:** LangChain (with **LCEL**, the expression language) composes
    components into runnables — good for linear RAG/tool chains. LangGraph models
    the app as a **graph**: nodes mutate a shared **state**, edges (including
    **conditional** ones) route flow, and it supports **checkpointing** (durable
    state, pause/resume, human-in-the-loop), cycles, and parallel branches. Agents
    with loops/HITL → LangGraph; straight-through chains → LangChain.

??? note "State in LangGraph: simple, then deep"
    **Simple:** There's a shared state object; each node reads it, does work, and
    returns updates to it.

    **The nuance:** State is typed (e.g. a TypedDict), and nodes return partial
    updates that are merged (reducers control how, e.g. append vs overwrite for
    message lists). Edges can be conditional functions of the state. A
    **checkpointer** persists state per thread, enabling resume-after-crash,
    time-travel debugging, and pausing for human approval — the things a bare loop
    can't do cleanly.

---

## Composition & graphs

=== "LCEL chain (LangChain)"

    ```python
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.output_parsers import StrOutputParser

    prompt = ChatPromptTemplate.from_template("Summarize: {text}")
    chain = prompt | model | StrOutputParser()      # composable runnable
    chain.invoke({"text": doc})
    ```

=== "LangGraph state machine"

    ```python
    from langgraph.graph import StateGraph, END

    def plan(state):   ...   # returns {"steps": [...]}
    def act(state):    ...   # calls a tool, returns {"observation": ...}
    def route(state):  return "act" if not state["done"] else END

    g = StateGraph(AgentState)
    g.add_node("plan", plan); g.add_node("act", act)
    g.set_entry_point("plan")
    g.add_conditional_edges("plan", route, {"act": "act", END: END})
    g.add_edge("act", "plan")           # loop back
    app = g.compile(checkpointer=saver) # durable state, resumable
    ```

!!! example "Worked scenario: chain works, but you need approval before a write"
    **Symptom:** A linear LangChain pipeline drafts an action, but you now must have
    a human approve before it executes.

    **Reasoning:**
    1. A linear chain can't cleanly **pause and resume** for input — move to
       **LangGraph**.
    2. Add an **interrupt** before the "execute" node; the graph pauses with state
       checkpointed.
    3. A human approves/edits; you **resume** the graph from the checkpoint.
    4. The execute node runs only after approval; everything is traced.

    **Talking point:** "Human-in-the-loop and resume-after-pause are exactly why you
    graduate from a chain to a graph."

??? question "Chains vs agents vs graphs — when each?"
    **Chain**: fixed sequence of steps, deterministic flow — simplest, best when the
    path is known. **Agent**: the model decides steps/tools dynamically — for
    open-ended tasks. **Graph (LangGraph)**: explicit stateful control flow with
    branching, cycles, persistence, and HITL — when you need reliable loops and
    resumability. Escalate only as complexity demands.

??? question "Why LangGraph over a hand-written agent loop?"
    A raw while-loop hides state and makes branching, retries, cycles, pausing for
    humans, and recovery hard. LangGraph makes **nodes/edges/state explicit**, adds
    **checkpointing** (durable, resumable, time-travel debug), conditional routing,
    and parallelism — turning "prompt-engineering a loop" into inspectable, testable
    control flow.

??? question "How does memory work and what are its limits?"
    LangChain offers conversation memory (buffer, windowed, summary, or vector-backed
    retrieval memory). Limits: raw buffers blow the context window; summaries lose
    detail; vector memory can retrieve irrelevant chunks. Treat memory as a
    **context-budget** problem — keep recent turns + retrieved relevant facts +
    compacted summary, not everything. In LangGraph, memory is part of persisted
    state.

??? question "How do you do structured/tool output reliably?"
    Bind tools/schemas to the model (function calling) and use structured-output
    parsers (or Pydantic models) so results are typed and validated; retry on parse
    failure. Keep tool descriptions crisp (the model reads them), validate args, and
    return minimal structured data. Treat tool output as untrusted (injection).

---

## Production

??? question "How do you stream responses and intermediate steps?"
    LangChain/LangGraph support streaming tokens and streaming **events**
    (intermediate node outputs, tool calls). Stream tokens to cut perceived latency;
    stream intermediate steps to show progress in agent UIs. Wire it to your
    transport (e.g. WebSocket/SSE) so the client renders as chunks arrive.

??? question "Why use LangSmith (or equivalent tracing)?"
    Agent/chain behavior is hard to debug blind. **Tracing** captures every step
    (inputs, prompts, tool calls, tokens, latency), so you can see where a run went
    wrong, compare versions, and build **eval** datasets from real traces.
    Observability + eval is how you ship changes on evidence, not vibes.

??? question "When should you NOT use LangChain/LangGraph?"
    When the task is a single model call or a thin, stable pipeline — the framework's
    abstractions add indirection and version churn for little gain. Also when you need
    tight control/perf and the abstraction hides too much. Use it when composition,
    tools, memory, or stateful agent control genuinely save you work; drop it when
    it's just overhead.

??? question "How do you evaluate a LangGraph agent?"
    Trace runs, build a labeled task set, and score **outcome** (correct final
    state) and **trajectory** (sensible steps/tool calls, efficiency). Eval
    components (routing accuracy, tool-arg validity, retrieval recall). Use
    LLM-as-judge with a rubric for trajectory quality, human-calibrated. Pin
    versions and re-run before shipping changes.

---

## Rapid-fire

| Q | A |
|---|---|
| LangChain in one line? | orchestration glue for LLM apps (models, prompts, tools, memory) |
| LCEL? | expression language to compose runnables with `|` |
| LangGraph in one line? | stateful graph/state-machine for cyclic, durable agent flows |
| Chain vs graph? | fixed sequence vs branching/cyclic stateful flow |
| Checkpointer? | persists graph state → resume, HITL, time-travel debug |
| Conditional edge? | route based on a function of state |
| Memory risk? | context bloat / irrelevant retrieval |
| Structured output? | bind schema/tools + validate (Pydantic) |
| Tracing tool? | LangSmith (traces + eval datasets) |
| When to skip it? | single call / thin stable pipeline |

---

## Pitfalls interviewers probe

- Using an agent/graph where a simple chain suffices (or vice versa).
- Hand-rolling a loop that needs LangGraph's state/persistence.
- Dumping full history into memory (context bloat).
- Trusting tool output as instructions (injection).
- No tracing → undebuggable agent behavior.
- Fighting the abstraction instead of dropping it when it hides too much.

---

## Self-quiz

1. Chain vs agent vs graph — pick one per scenario and justify.
2. Why graduate from a LangChain chain to LangGraph?
3. Explain LangGraph state, edges, and the checkpointer.
4. Add human-in-the-loop approval before a write step — how?
5. Memory options and their failure modes.
6. How do you get reliable structured/tool output?
7. What does tracing (LangSmith) buy you?
8. When is the framework the wrong choice?

!!! note "Cross-links"
    Deep dives: [LangChain](../GenAI-Topics/langchain/index.md) ·
    [LangGraph](../GenAI-Topics/langgraph/index.md) ·
    Related: [Agents Interview Q&A](Agents_Interview_QA.md) ·
    [AI Engineer Interview Q&A](AI_Engineer_Interview_QA.md)
