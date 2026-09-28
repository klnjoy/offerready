# OfferReady — Scenario Tree Format (Phase 3)

The scenario tree is the **Pro differentiator**: it makes a candidate *defend a
decision* through progressive follow-ups, exactly the way a senior/staff/FDE
interview does (spec §23). It is **deterministic** — every branch is authored,
no LLM required for V1 — but the shape is designed so an LLM interviewer can be
dropped in later (spec §24) without changing the engine or storage.

## Two halves: teaser (public) vs body (protected)

A scenario has a **public teaser** (safe to ship in the static site and to
search engines) and a **protected body** (the full node tree with model
answers, follow-ups, and reflections). The body is stored server-side in
`premium_content.content` and served ONLY through the entitlement-gated API
(spec §20/§21). It must never appear in the public build.

```
premium_content row:
  slug                 "fde-secure-rag"
  title                "Secure Enterprise RAG Assistant (FDE)"
  category             "fde"
  required_entitlement "fde_pro"
  teaser               <public JSON: setup + first prompt + node titles>   ← may be public
  content              <protected JSON: full node tree>                    ← gated
  published            true
```

## Scenario JSON shape

```jsonc
{
  "slug": "fde-secure-rag",
  "title": "Secure Enterprise RAG Assistant (FDE)",
  "role": "Forward Deployed Engineer",       // display only
  "category": "fde",                          // fde | system_design | incident | why_chain | architecture
  "required_entitlement": "fde_pro",
  "estimated_minutes": 25,
  "teaser": {                                  // PUBLIC-safe
    "setup": "A customer says: \"We need a secure enterprise RAG assistant...\"",
    "you_will_practice": ["retrieval design", "PII handling", "delivery scope"],
    "node_titles": ["Approach", "Why hybrid?", "Freshness", "..."],  // titles only, no answers
    "sample_node": { /* ONE node, fully shown, as a quality sample */ }
  },
  "start": "n1",                               // id of the first node
  "nodes": {                                   // PROTECTED (full tree)
    "n1": { /* Node */ },
    "n2": { /* Node */ }
  }
}
```

## Node types

Every node has: `id`, `kind`, `prompt`. Node kinds map to the §23 flow.

| kind | meaning | key fields |
|---|---|---|
| `decision` | Candidate makes an open choice; then reveals a model answer | `prompt`, `model` (strong answer), `signals` (what a good answer shows), `next` |
| `choice` | Candidate picks from options; each option branches | `prompt`, `options:[{label,next,note}]` |
| `why` | Interviewer challenges the prior decision ("why?/what if?") | `prompt`, `model`, `next` |
| `tradeoff` | Name the cost of the decision | `prompt`, `model`, `next` |
| `constraint` | A production/security/cost constraint is introduced | `prompt`, `constraint_type` (production\|security\|cost\|latency), `model`, `next` |
| `incident` | Something breaks; debug it | `prompt`, `model`, `next` |
| `reflection` | Final self-assessment; free-text + self-rate | `prompt`, `checklist:[...]`, `next` |
| `next_drill` | Recommend the next scenario/topic (terminal) | `prompt`, `recommend:[{label,slug|path}]` |

A **Node**:

```jsonc
{
  "id": "n2",
  "kind": "why",
  "prompt": "Why hybrid retrieval and not pure vector search?",
  "model": "Pure vector misses exact terms (IDs, codes); keyword misses paraphrase; hybrid gets both. Trade-off: two indexes to maintain.",
  "signals": ["names the failure mode of each", "states the trade-off"],  // optional
  "next": "n3",                    // linear advance (decision/why/tradeoff/constraint/incident/reflection)
  // OR for kind:"choice":
  "options": [
    { "label": "Add a reranker", "next": "n4", "note": "good — fixes precision" },
    { "label": "Just raise top-k", "next": "n4b", "note": "risky — dilutes context" }
  ]
}
```

## Engine contract (client)

The client engine (`scenario.js`) is a pure state machine over `nodes`:

1. Start at `start`. Render `prompt` + an answer box (or option buttons for `choice`).
2. On submit/select: record the answer, reveal `model` (+ `signals`), and let
   the user self-rate 1–5 (for `decision`/`why`/`tradeoff`/`constraint`/`incident`).
3. Advance to `next` (or the chosen option's `next`). `next_drill` ends the run.
4. Session state (answers, ratings, current node, per-kind scores) is persisted:
   Supabase `practice_sessions` when signed in, else `localStorage`.

The engine never needs the model answers to decide branching (branches are in
the data), so a future LLM interviewer can *replace* the `model`/follow-up
generation without touching the traversal or storage (§24).

## Access rules

- **Anonymous / Free:** may fetch the **teaser** only (public). The full
  `nodes` tree requires `required_entitlement` and is returned only by the
  authorized API after a server-side entitlement check. Fail closed (§34).
- The static site ships **only** teasers. Full trees live in Supabase.
