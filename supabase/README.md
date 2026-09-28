# OfferReady — Supabase foundation (Phase 2)

This folder holds the database schema, Row Level Security (RLS) policies, and
RLS tests for the OfferReady SaaS layer. **No secrets live here.** Nothing in
this phase enables payments or protects content yet — it establishes identity,
storage, and access control that later phases build on.

## What's here

```
supabase/
  migrations/
    0001_schema.sql   # tables: profiles, subscriptions, entitlements,
                      # features, premium_content, practice_sessions,
                      # user_progress, webhook_events (spec §12)
    0002_rls.sql      # RLS enable + GRANTs + per-user policies (spec §14)
  tests/
    rls_test.sql      # access-matrix assertions (spec §29 DB subset)
  README.md           # this file
```

## Access model (how authorization works)

- Access is granted by **feature entitlements** (`entitlements.feature`), never
  by a raw `plan = 'pro'` flag (spec §13). A Pro subscription writes a set of
  feature rows (`interview_pro`, `fde_pro`, …) via the server-side webhook
  handler in Phase 4.
- Users can **read only their own** rows (`auth.uid() = user_id`). RLS enforces
  this at the database, so a stolen anon key or a tampered client still can't
  read another user's data (spec §28).
- `subscriptions` and `entitlements` are **read-only** to the user. They are
  written **only** server-side with the service-role key (which bypasses RLS)
  from verified Stripe webhooks — never from the browser.
- `premium_content.content` has **no client read policy at all**. With RLS on
  and no SELECT policy, every browser read is denied. Bodies are served only by
  the backend after an entitlement check (spec §20/§21). Public teasers live in
  the static site, not in this table's client-visible surface.
- `webhook_events` is service-role only (idempotency ledger, spec §18).

## Setup

1. **Create a Supabase project** (free tier is fine) at supabase.com.
2. **Run the migrations** in order — Supabase SQL Editor, or the CLI:
   ```bash
   # SQL Editor: paste 0001_schema.sql, Run; then 0002_rls.sql, Run.
   # Or with the Supabase CLI + a linked project:
   supabase db push          # if you add these to a migrations workflow
   # Or with psql:
   psql "$DATABASE_URL" -f supabase/migrations/0001_schema.sql
   psql "$DATABASE_URL" -f supabase/migrations/0002_rls.sql
   ```
3. **Run the RLS tests** and confirm it prints `ALL RLS TESTS PASSED`:
   ```bash
   psql "$DATABASE_URL" -f supabase/tests/rls_test.sql
   ```
   The test runs in a transaction and **rolls back** — it leaves no data.
4. **Set environment variables** from `.env.example`:
   - Browser-safe (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) go into
     `content/assets/api-config.js` (the two placeholders there) so the site
     can sign users in.
   - Server-only keys (`SUPABASE_SERVICE_ROLE_KEY`, Stripe secrets, `OPENAI_API_KEY`)
     go into **Vercel Environment Variables** — never committed, never shipped
     to the browser (spec §15).

## Subscription-state policy (spec §19)

We do **not** treat every Stripe state as Pro. The webhook handler (Phase 4)
will map states to entitlements:

| Stripe status | Access |
|---|---|
| `active`, `trialing` | Pro entitlements active |
| `past_due` | keep access briefly (grace) — configurable |
| `canceled` with `cancel_at_period_end` | access until `current_period_end` when `ACCESS_UNTIL_PERIOD_END=true` |
| `unpaid`, `incomplete_expired` | no Pro access |
| `incomplete`, `paused` | no new Pro access |

`ACCESS_UNTIL_PERIOD_END` (env) controls whether a cancellation keeps access
through the paid period. Default `true`.

## Fail-closed (spec §34)

If the entitlement service or Supabase is unavailable, or a token can't be
verified, the backend **denies** Pro access — it never grants access from
client-side claims. The server auth helper (`api/lib/supabaseAuth.js`) returns
`null` on any error, so callers deny.

## Phase 3 — premium scenario API + content (added)

The defend-your-decision **scenario engine** is the Pro differentiator. Its data
and authorization live here:

```
supabase/premium/
  scenario-schema.md          # the node-tree format (spec §23)
  scenarios/fde-secure-rag.json  # authored flagship (teaser + full tree)
  seed_scenarios.js           # loads scenarios into premium_content (service-role)
```

Backend endpoints (Vercel `api/`):

- `GET /api/premium/scenarios` — public list of **teasers** only.
- `GET /api/premium/scenarios/:slug` — the **full tree**, returned ONLY when the
  caller is authenticated (verified Supabase JWT) AND holds the required
  entitlement. Anonymous → 401; authenticated-without-entitlement → 403 + teaser;
  entitled → 200. Fail-closed on any backend error (spec §20/§28/§34).
- Helpers: `api/lib/supabaseAuth.js` (identity), `api/lib/entitlements.js`
  (authorization, service-role), `api/lib/http.js` (CORS/JSON).

### Seeding scenarios (server-side)

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/premium/seed_scenarios.js
```

This upserts each `scenarios/*.json` into `premium_content`. After seeding, the
full node tree exists **only in Supabase** — it is never in the public build.

### To grant a test user access (before Stripe exists)

Insert an entitlement manually (SQL Editor), then sign in as that user:

```sql
insert into public.entitlements (user_id, feature, status)
values ('<the-user-uuid>', 'fde_pro', 'active')
on conflict (user_id, feature) do update set status = 'active';
```

The scenario page will then return the full tree for that user and deny everyone
else — a clean end-to-end authorization test even before payments.

### Content-extraction stance (important)

Phase 3 adds the scenario engine as **NEW protected content** (authored JSON in
Supabase). It does **not** yet remove the existing flagship prose
(`Interview_Why_Chains`, `Interview_Production_Incidents`,
`Interview_Requirements_to_Production`) from the public static site — those
remain public for now. Migrating that prose behind the paywall is a deliberate,
reviewed sub-step (it changes what's public) and will be done on explicit
sign-off, converting each to a scenario tree + public teaser.

## What's NOT done yet

- No Stripe, no checkout, no webhooks (Phase 4) — entitlements are set manually
  for testing until then.
- Existing flagship prose is still public (see extraction stance above).
- End-to-end auth/entitlement testing needs a live Supabase project + the env
  vars set in Vercel.
- Live payments are disabled by default (spec §31/§39).
