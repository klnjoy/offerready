-- OfferReady SaaS — Row Level Security (Phase 2)
-- =============================================================================
-- Spec §14. Enable RLS on every table exposed via the Supabase API, deny by
-- default, and add explicit per-user policies. Per current Supabase guidance,
-- RLS policies do NOT replace table GRANTs — we set both:
--   * REVOKE broad privileges, GRANT the minimum to anon/authenticated.
--   * The `service_role` bypasses RLS (used only by the server-side backend
--     with the service-role key) for webhook-driven writes to subscriptions,
--     entitlements, and premium_content.
--
-- Access model:
--   * A user may read/write ONLY their own rows (auth.uid() = user_id).
--   * profiles keyed by id (= auth.uid()).
--   * entitlements / subscriptions are READ-ONLY to the user (writes are
--     server-side via service_role from Stripe webhooks — never the browser).
--   * premium_content: no anon/authenticated row access at all. Bodies are
--     served exclusively by the backend after an entitlement check (§20/§21).
--   * webhook_events: service_role only.
--
-- Idempotent: drops each policy before recreating.
-- =============================================================================

-- Enable RLS everywhere (deny-by-default once enabled).
alter table public.profiles          enable row level security;
alter table public.subscriptions     enable row level security;
alter table public.entitlements      enable row level security;
alter table public.features          enable row level security;
alter table public.premium_content   enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.user_progress     enable row level security;
alter table public.webhook_events    enable row level security;

-- ---------------------------------------------------------------------------
-- GRANTs (RLS is necessary but not sufficient — Supabase guidance).
-- Start from a clean slate for the API roles, then grant the minimum.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

-- Users operate on their own state. premium_content and webhook_events are
-- deliberately NOT granted to authenticated (server-side only).
grant select, insert, update on public.profiles          to authenticated;
grant select                 on public.subscriptions     to authenticated;
grant select                 on public.entitlements      to authenticated;
grant select                 on public.features          to anon, authenticated;
grant select, insert, update on public.practice_sessions to authenticated;
grant select, insert, update on public.user_progress     to authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Insert is normally done by the handle_new_user() trigger (security definer),
-- but allow a user to create their own profile row defensively.
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- subscriptions — user may READ own; writes are server-side (service_role).
-- ---------------------------------------------------------------------------
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- entitlements — user may READ own; writes are server-side (service_role).
-- ---------------------------------------------------------------------------
drop policy if exists entitlements_select_own on public.entitlements;
create policy entitlements_select_own on public.entitlements
  for select to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- features — public catalog (safe reference data).
-- ---------------------------------------------------------------------------
drop policy if exists features_select_all on public.features;
create policy features_select_all on public.features
  for select to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- premium_content — NO row access for anon/authenticated. Intentionally NO
-- SELECT policy: with RLS on and no policy, all client reads are denied.
-- The backend uses service_role (bypasses RLS) after checking entitlements.
-- (Teasers shown to the public live in the static site, not fetched here.)
-- ---------------------------------------------------------------------------
-- (no policies on purpose)

-- ---------------------------------------------------------------------------
-- practice_sessions — full CRUD on own rows.
-- ---------------------------------------------------------------------------
drop policy if exists sessions_select_own on public.practice_sessions;
create policy sessions_select_own on public.practice_sessions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists sessions_insert_own on public.practice_sessions;
create policy sessions_insert_own on public.practice_sessions
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists sessions_update_own on public.practice_sessions;
create policy sessions_update_own on public.practice_sessions
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- user_progress — full CRUD on own rows.
-- ---------------------------------------------------------------------------
drop policy if exists progress_select_own on public.user_progress;
create policy progress_select_own on public.user_progress
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists progress_insert_own on public.user_progress;
create policy progress_insert_own on public.user_progress
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists progress_update_own on public.user_progress;
create policy progress_update_own on public.user_progress
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- webhook_events — service_role only. No policies for anon/authenticated and
-- no grants => fully inaccessible from the browser.
-- ---------------------------------------------------------------------------
-- (no policies on purpose)
