# OfferReady — Design Laws (steering)

These are the design laws for every UI change to OfferReady. They are a
companion to `offerready-product.md` (the product north star). When a request
conflicts with these laws, surface the conflict rather than silently diverging.

Design direction: calm, minimal, editorial, focused, premium, intentional
(Clera / Linear / Vercel / Ramp). Palette: navy + slate + white + soft green.
No gradients on functional surfaces, no neon, no heavy shadows, no lift-on-hover.

## The 10 laws

1. **One primary CTA per screen.** Exactly one visually dominant action.
   Everything else is secondary (quiet links / outline buttons).
2. **One primary question per page.** Each page answers a single question —
   Dashboard: *How ready am I?* · Jobs: *What am I preparing for?* ·
   Analysis: *How do I match this role?* · Practice: *What do I practice next?* ·
   Account: *How do I manage my account?*
3. **Context before metrics.** Show what/which job first; never lead with raw
   scores. A number without context is noise.
4. **Typography before cards.** Reach for headline → subhead → body before
   wrapping things in a container. No card-in-card.
5. **Chips before forms.** Prefer a tap-to-select chip over a form field when
   the choice is bounded.
6. **Whitespace before widgets.** Add space, not another panel. Fewer, calmer
   sections beat dense dashboards.
7. **Remove before adding.** The first move in any screen is to delete what
   doesn't earn its place. Simplify, then build.
8. **`Job → Analysis → Practice → Readiness` always visible.** The workflow is
   the product. Keep the user oriented in that chain on every screen.
9. **If it doesn't move the user forward, it doesn't ship.** Before building any
   element, ask: *"Does this help the user move from Job → Analysis → Practice →
   Readiness?"* If no — do not build it.
10. **Simplicity beats cleverness.** The obvious, boring, legible solution wins
    over the impressive one.

## How to apply (gate for any UI work)

- Every new element must name the workflow stage it advances
  (Job / Analysis / Practice / Readiness). If it can't, cut it.
- No decorative widgets, placeholder charts, duplicate metrics, or secondary
  CTAs competing with the primary action.
- When something fails law #9, say so and stop — propose the workflow-aligned
  alternative instead of building the thing anyway.
- These laws are visual/UX discipline only. They never override the hard rules
  in `offerready-product.md` (no outcome promises, backend-enforced
  entitlements, no fabricated experience, AI output labeled, data isolation).
- Scope discipline: this is simplification, not new features, new nav, new
  architecture, or AI-prompt changes unless explicitly requested.
