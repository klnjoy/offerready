---
icon: material/airplane-takeoff
---

# Path: Forward Deployed Engineer (FDE)

A curated preparation path for **Forward Deployed Engineer** interviews — roles
where you turn a vague customer need into working software, fast, in a messy real
environment, and explain it to non-engineers. This page is your *plan*; it routes
into existing pages rather than repeating them.

!!! abstract "What this role is really testing"
    A hybrid of **strong engineering + high-stakes customer-facing judgment.**
    Can you decompose ambiguity, ship a pragmatic thin slice, integrate with the
    customer's imperfect systems, troubleshoot live, and tie it all to a business
    outcome? Breadth and speed matter more than perfect depth in any one area.

    See [Senior / Staff / Principal / FDE](Interview_Level_Comparison.md) for what
    interviewers listen for at each level.

---

## The 5 skills this path builds

| Skill | Why it decides FDE | Where you build it |
|-------|--------------------|--------------------|
| **Decompose ambiguity** | Turn "we want AI for support" into a shippable slice | [Requirements → Production](Interview_Requirements_to_Production.md) |
| **Build a pragmatic thin slice** | Working over perfect; integrate messy reality | [FDE Live-Coding & Scenarios](FDE_LiveCoding_Scenarios_Prep.md) · [Setup Guides](../Setup-Guides/index.md) |
| **Live troubleshooting** | Recover in front of the customer | [Production Incident Interviews](Interview_Production_Incidents.md) |
| **Breadth across the stack** | You'll touch data, RAG, agents, cloud, APIs | [GenAI Topics](../GenAI-Topics/index.md) · [Technologies](../Technologies/index.md) |
| **Explain to non-engineers** | Tie the build to the customer's outcome | [Behavioral / STAR](Behavioral_STAR_Interview_QA.md) |

---

## Study order (about 2 weeks)

FDE rewards breadth + speed, so this path is wider and more hands-on.

### Week 1 — Breadth + build fast

1. **[Level Comparison](Interview_Level_Comparison.md)** — internalize the FDE
   "tell": ask about the *customer's* constraints and success criteria first.
2. **[FDE Interview Q&A](Forward_Deployed_Engineer_Interview_QA.md)** — the core
   role expectations and scenarios.
3. **Core build blocks, fast:** [RAG](../GenAI-Topics/rag/index.md) ·
   [Agent Engineering](../GenAI-Topics/agent-engineering/index.md) ·
   [MCP](../GenAI-Topics/mcp/index.md) — enough to build, not to lecture.
4. **[Setup Guides](../Setup-Guides/index.md)** — actually stand up an
   [LLM](../Setup-Guides/llm-access/index.md), a
   [vector DB](../Setup-Guides/vector-db-setup/index.md), a
   [RAG app](../Setup-Guides/first-rag/index.md), and an
   [agent](../Setup-Guides/first-agent/index.md). Speed matters.
5. **[FDE Coding Prep](FDE_Coding_Interview_Prep.md)** — the coding bar.

### Week 2 — Integration, incidents & communication

6. **[FDE Live-Coding & Scenarios](FDE_LiveCoding_Scenarios_Prep.md)** — build
   under time pressure against realistic prompts.
7. **[Requirements → Production](Interview_Requirements_to_Production.md)** —
   drive a vague customer ask to a shippable slice; scope hard.
8. **Integration surfaces:** [FastAPI](../Technologies/fastapi/index.md) ·
   [Snowflake](../Technologies/snowflake/index.md) /
   [Snowflake Cortex](../Snowflake-Cortex/index.md) — the customer's data lives
   somewhere; know how to plug in.
9. **[Production Incident Interviews](Interview_Production_Incidents.md)** —
   practice recovering live: diagnose → mitigate → prevent, out loud.
10. **[Behavioral / STAR](Behavioral_STAR_Interview_QA.md)** — explain the build
    and its impact to a non-technical stakeholder.

---

## Drills that move the needle

- **Scope drill:** take a one-line customer ask ("help our support team with AI")
  and, in 3 minutes, produce clarifying questions + a shippable thin slice
  ([Requirements → Production](Interview_Requirements_to_Production.md)).
- **Build-fast drill:** from the [Setup Guides](../Setup-Guides/index.md), stand
  up a working RAG app end to end without looking up every step.
- **Live-fix drill:** run a [Production Incident](Interview_Production_Incidents.md)
  and narrate the fix as if the customer is watching.
- **Translate drill:** explain your last design to a non-engineer in 60 seconds
  ([Behavioral / STAR](Behavioral_STAR_Interview_QA.md)).
- **Full run:** [Master Interview Simulator](Interview_Master_Simulator.md) +
  [Master Cheat Sheets](Interview_Cheat_Sheets.md).

---

## Are you ready? (self-check)

- [ ] I ask about the customer's constraints and success criteria *first*.
- [ ] I can scope a vague ask into a shippable thin slice and defend the cut.
- [ ] I can build a working RAG app / agent fast, integrating messy real systems.
- [ ] I can troubleshoot live and narrate diagnose → mitigate → prevent.
- [ ] I have breadth across RAG, agents, data platforms, and APIs.
- [ ] I can explain the build and its business impact to a non-engineer.

If most boxes are checked, you're pitching as an FDE. If you're strong on depth
but freeze on ambiguity or customer communication, drill scope and translation.

!!! note "Related paths"
    [AI / GenAI Engineer path](Path_AI_Engineer.md) ·
    [Staff / Principal Architect path](Path_Staff_Principal_Architect.md) ·
    [Data & AI / Platform Engineer path](Path_Data_Platform.md) ·
    [Interview Guide overview](Interview_Guide_Overview.md)
