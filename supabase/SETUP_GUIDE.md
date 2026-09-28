# OfferReady — Supabase + Pro Setup (click-by-click)

This turns the **Pro layer on** so sign-in and the scenario engine actually
work end-to-end. It's all test-mode / no payments. Follow top to bottom; each
step says exactly what to click and paste. Nothing here commits a secret.

**Time:** ~30–40 minutes. **You need:** a browser, your GitHub/Vercel access.

---

## Step 1 — Create a Supabase project

1. Go to **https://supabase.com** → **Start your project** → sign in with GitHub.
2. Click **New project**.
   - **Name:** `offerready`
   - **Database password:** generate a strong one and **save it** (you rarely need it, but keep it).
   - **Region:** pick the one closest to you.
   - Plan: **Free**.
3. Click **Create new project** and wait ~2 minutes for it to provision.

---

## Step 2 — Grab your keys

1. Left sidebar → **Project Settings** (gear) → **API**.
2. Copy and keep these three values somewhere safe for now:
   - **Project URL** → e.g. `https://abcdxyz.supabase.co`  *(browser-safe)*
   - **anon / public** key (under "Project API keys") *(browser-safe)*
   - **service_role** key *(SECRET — server only, never in the browser)*

> Which is which: the **anon** key is protected by the RLS you're about to
> install, so it's safe in the site. The **service_role** key bypasses RLS —
> it goes ONLY into Vercel, never into the repo or `api-config.js`.

---

## Step 3 — Run the database migrations

1. Left sidebar → **SQL Editor** → **New query**.
2. Open `supabase/migrations/0001_schema.sql` from the repo, copy **all** of it,
   paste into the editor, click **Run**. You should see "Success. No rows returned."
3. New query again → paste all of `supabase/migrations/0002_rls.sql` → **Run**.
   (This enables Row Level Security + policies + grants.)
4. Sanity check: **Table Editor** (left sidebar) should now list `profiles`,
   `subscriptions`, `entitlements`, `features`, `premium_content`,
   `practice_sessions`, `user_progress`, `webhook_events`.

---

## Step 4 — Run the RLS test (prove security works)

1. **SQL Editor** → **New query** → paste all of `supabase/tests/rls_test.sql` → **Run**.
2. Expected result: the last line prints **`ALL RLS TESTS PASSED`**.
   - If it raises an error instead, the message says which rule failed — send it
     to me and I'll fix the policy. (The test rolls back, so it leaves no data.)

This is the first real proof that a user can only see their own rows and that
premium content is not client-readable.

---

## Step 5 — Turn on sign-in in the site (browser-safe keys)

1. In the repo, open **`content/assets/api-config.js`**.
2. Find these two placeholder lines and replace with your **Project URL** and
   **anon** key from Step 2:
   ```js
   var SUPABASE_URL = "https://your-project-ref.supabase.co";
   var SUPABASE_ANON_KEY = "your-supabase-anon-publishable-key";
   ```
3. Save, commit, push. (I can do this commit for you once you paste the two
   values into chat — they're browser-safe.)
4. Supabase → **Authentication** → **Providers** → make sure **Email** is
   enabled. For easy testing, **Authentication → Providers → Email → turn OFF
   "Confirm email"** temporarily so you can sign in immediately (turn it back on
   before real launch).
5. Supabase → **Authentication → URL Configuration** → set **Site URL** to
   `https://klnjoy.github.io/offerready/` and add it under **Redirect URLs**.

After CI rebuilds, the sign-in UI on the site becomes live.

---

## Step 6 — Put the SECRET keys in Vercel (server only)

1. Go to **vercel.com** → your **offerready** project → **Settings** →
   **Environment Variables**.
2. Add these (Environment: **Production** + **Preview**):
   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | your Project URL |
   | `SUPABASE_ANON_KEY` | your anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | your **service_role** key (secret) |
   | `ALLOWED_ORIGIN` | `https://klnjoy.github.io` |
   | `OPENAI_API_KEY` | (already set if Analyze/chatbot work) |
3. Click **Save**, then **Deployments → … → Redeploy** the latest so the new
   env vars take effect.

---

## Step 7 — Seed the scenarios into the database

Run this locally (needs Node 18+). It loads **every** `supabase/premium/scenarios/*.json`
into the `premium_content` table using your service-role key. **Do not commit
the key** — just set it for this one command:

**PowerShell (Windows):**
```powershell
$env:SUPABASE_URL="https://your-project-ref.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
node supabase/premium/seed_scenarios.js
```
Expected: one `upserted: <slug>` line per scenario (currently **7**), then `Done.`:
`ai-architect-multitenant-platform`, `ai-engineer-rag-feature`,
`ai-security-prompt-injection`, `cloud-platform-incident`,
`data-architect-snowflake-cortex`, `devsecops-multiagent-sdlc`, `fde-secure-rag`.

Verify in Supabase **Table Editor → premium_content** — **7 rows**, each
`published = true`. Re-running the seed is safe (it upserts by slug), so add a
new scenario JSON later and just re-run this command.

---

## Step 8 — Create a test user + grant Pro (before Stripe exists)

1. On the live site, use the sign-in form to **Create account** with a test
   email + password (Step 5.4 let you skip confirmation).
2. Supabase → **Authentication → Users** → copy your new user's **UID**.
3. Supabase → **SQL Editor** → run (paste your UID). Each scenario requires a
   specific feature key, so grant the **full Pro bundle** to unlock all of them:
   ```sql
   insert into public.entitlements (user_id, feature, status)
   select 'PASTE-USER-UID-HERE', f.key, 'active'
   from public.features f
   on conflict (user_id, feature) do update set status = 'active';
   ```
   (To test the *upgrade gate* on a specific scenario instead, grant just one
   key — e.g. `fde_pro` unlocks only the FDE scenario; the others stay gated.)

Which scenario needs which feature:

| Scenario | `required_entitlement` |
|---|---|
| FDE Secure RAG | `fde_pro` |
| AI Engineer RAG feature | `interview_pro` |
| AI Architect multi-tenant platform | `architecture_pro` |
| AI Security prompt injection | `architecture_pro` |
| DevSecOps multi-agent SDLC | `architecture_pro` |
| Data Architect Snowflake Cortex | `system_design_pro` |
| Cloud/Platform incident | `incident_pro` |

This manually grants Pro to your test user — so you can verify the gate without
any payment.

---

## Step 9 — Verify the gate end-to-end (the real test)

On the live site, open **Practice** (the scenarios page):

| As… | Expected | Proves |
|---|---|---|
| **Signed out** | See the teaser + a "Sign in" gate; the full tree does NOT load | anon → 401, fail-closed |
| **Signed in, WITHOUT the entitlement** (delete the row from Step 8, or use a 2nd account) | See teaser + "OfferReady Pro" upgrade gate; full tree does NOT load | authenticated → 403 |
| **Signed in, WITH the matching entitlement** (e.g. the full bundle from Step 8) | The full scenario runs (Approach → Why → … → Reflection) | entitled → 200 |

Extra checks (spec §29):
- Open DevTools → Application → Local Storage and set a fake `isPro` flag →
  reload → **still gated**. (Client claims are ignored.)
- View-source / search the deployed site for a protected answer phrase (e.g.
  "tombstone deletes") → **not present**. (`check_site.py` already confirms this.)

If all three rows behave as expected, the auth → entitlement → protected-content
flow is **verified end-to-end** — the first true Pro verification.

---

## Troubleshooting

- **"Sign-in isn't available yet"** on the site → Step 5 keys not set (or CI
  hasn't rebuilt yet). Hard-refresh.
- **Scenario list won't load** → check the browser console; usually
  `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_URL` missing in Vercel (Step 6), or
  you didn't redeploy after adding them.
- **403 even though you granted `fde_pro`** → confirm the `entitlements` row
  `status = 'active'` and `expires_at` is null or future; confirm you signed in
  as that exact user.
- **RLS test failed** → paste me the error line.

---

## What this does NOT do

- No payments. Entitlements are granted manually here; Stripe checkout +
  webhooks that grant them automatically is **Phase 4**.
- "Confirm email" is off for testing — turn it back on before launch.
- The existing flagship prose (Why-Chains, Incidents, Requirements→Production)
  is still public; converting it to gated scenarios is a later step.
