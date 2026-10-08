---
icon: material/text-box-edit
---

# Prompt Engineering

*Last reviewed: October 2026*

!!! info "What's changed recently"
    - **Reasoning models changed chain-of-thought.** Models that think before
      answering need less "think step by step" prompting, and hand-written
      reasoning steps can even hurt. Give clear goals, constraints, and success
      criteria instead, and tune the reasoning-effort setting.
    - **Schema-enforced structured output is widely available.** Major providers
      can constrain output to a JSON Schema, so "return ONLY valid JSON" prompting
      is a fallback, not the main tool.
    - **Prompts became versioned artifacts.** Teams manage them in registries,
      gate changes on evals, and increasingly use automated prompt optimization
      (DSPy-style) against a metric.

Prompt engineering is designing inputs that reliably get high-quality output from
an LLM — through clear instructions, examples, reasoning strategies, and
structured output constraints.

<!-- RELATED-MODULE -->

## Core techniques

```mermaid
flowchart TB
    Z[Zero-shot: instruction only]
    F[Few-shot: instruction + examples]
    C[Chain-of-Thought: 'think step by step']
    R[ReAct: reason + act with tools]
    Z --> F --> C --> R
```

| Technique | When to use |
|-----------|-------------|
| **Zero-shot** | Simple, well-known tasks |
| **Few-shot** | Show the format/style you want with 2–5 examples |
| **Chain-of-Thought** | Multi-step reasoning on non-reasoning models (reasoning models do this internally) |
| **ReAct** | Agentic tasks that interleave reasoning and tool calls |

## Anatomy of a good prompt

- **Role/system**: who the model is and constraints ("You are a SQL expert. Only
  answer from the provided schema.").
- **Task**: explicit, unambiguous instruction.
- **Context**: the data/grounding (RAG chunks, schema).
- **Format**: exact output shape (JSON keys, table, length).
- **Guardrails**: "If unsure, say you don't know. Don't invent columns."

## Structured output

```text
Return ONLY valid JSON:
{ "category": "<billing|technical|other>", "priority": "<low|med|high>" }
```

Constrain the output shape so downstream code can parse it. Prefer the
provider's **schema-enforced structured output** or strict tool calling, which
constrains decoding to your JSON Schema. Prompt-only "return JSON" is a fallback,
and you still validate (for example with Pydantic) because a schema guarantees
shape, not correctness.

## Text-to-SQL notes

A common enterprise use case (and a full course project):

- Give the model the **schema** and a few example query pairs.
- Constrain to read-only, validated tables; **never** execute unvalidated SQL.
- Add a verification/execution step and return the result plus the SQL.

## Interview questions

??? question "Zero-shot vs few-shot vs chain-of-thought?"
    Zero-shot = instruction only; few-shot = add examples to fix format/behavior;
    chain-of-thought = prompt step-by-step reasoning for complex tasks.

??? question "How do you make LLM output reliable for a program to consume?"
    Constrain output to a strict schema (JSON/function calling), give an example,
    validate/parse it, and handle failures with a retry or repair prompt.

??? question "How do you reduce hallucination?"
    Ground with RAG, instruct "answer only from context / say you don't know,"
    lower temperature, request citations, and verify against source data.

---

## Interview deep dive

### 60-second talking points

- **"Structure beats cleverness."** Clear role, task, context, output format, and
  guardrails outperform 'magic' phrases.
- **"Match technique to task."** Zero-shot for simple, few-shot to fix format,
  chain-of-thought for reasoning, ReAct for tool use.
- **"Constrain the output so code can consume it."** JSON/function-calling +
  validation.

### Scenario & system-design questions

??? question "Design a reliable text-to-SQL prompt for a business analytics tool."
    Provide the **schema** and 2-3 example question→SQL pairs (few-shot); instruct
    read-only + only known tables; require the model to return SQL in a fixed
    block; then **validate/parse** and run against a sandbox with row limits;
    return both the SQL and results. Never execute unvalidated SQL.

??? question "The model returns slightly different JSON each call, breaking parsing."
    Use **structured output / function calling** to enforce a schema; give one
    exact example; lower temperature; and add a **repair step** — if parsing
    fails, re-prompt with the error. Validate with Pydantic.

??? question "How do you stop prompt injection in a RAG/agent app?"
    Treat retrieved/user content as **untrusted data, not instructions**; separate
    system instructions from context; constrain tools with least privilege; strip/
    escape; and add output checks. Assume any document can contain 'ignore your
    instructions.'

### Pitfalls interviewers probe

- Vague instructions / no output format → inconsistent results.
- Too many few-shot examples (cost, drift) or contradictory ones.
- Forgetting "say you don't know" → hallucination.
- Ignoring prompt injection from retrieved content.
- Not lowering temperature for deterministic tasks.
- Forcing verbose chain-of-thought onto reasoning models (cost, no gain).

### Rapid-fire

| Q | A |
|---|---|
| Zero vs few-shot? | Instruction only vs with examples |
| Chain-of-thought? | Prompt step-by-step reasoning for complex tasks |
| ReAct? | Interleave reasoning + tool actions |
| Enforce JSON? | Structured output / function calling + validation |
| Prompt injection defense? | Treat context as data, least-privilege tools, output checks |

## How interviewers probe this

??? question "How do you manage prompts across 30 features and five teams?"
    A strong answer covers: prompts in version control or a registry with owners;
    templates with typed variables; an eval set per prompt that gates changes in
    CI; canary rollout; the prompt version logged on every trace; and rollback
    independent of code deploys.

??? question "A prompt that worked on the old model regressed on the new one. What do you do?"
    Run the eval suite on both models to find where it regressed, read the new
    model's prompting guidance (reasoning models often want less scaffolding),
    adjust and re-evaluate, and pin the old model for that feature until the new
    prompt passes. Treat model upgrades as releases.

??? question "Structured output is on, but downstream still breaks. Why?"
    The schema guarantees shape, not meaning: values can be wrong, enums can be
    semantically misused, or fields can be empty. Add semantic validation,
    business-rule checks, a repair or retry path, and evals on field-level
    accuracy. Also watch for truncation from low max-token limits.

??? question "How would you systematically improve a prompt instead of guessing?"
    Define a metric and a labeled dataset, establish a baseline, change one thing
    at a time (instructions, examples, order, output format), and keep what moves
    the metric. Automated optimizers can search over instructions and few-shot
    examples against the same metric.
