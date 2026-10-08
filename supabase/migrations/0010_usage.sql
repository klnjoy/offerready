-- OfferReady SaaS — Free vs Pro usage metering (plans)
-- =============================================================================
-- One row per successful use of a metered AI feature, so the API can enforce
-- the monthly Free/Pro limits in api/_lib/plans.js (calendar month, UTC):
--   analyses, ai_grading, voice_mock, custom_scenarios, story_ai
-- Saved jobs are NOT metered here: that limit counts rows in public.jobs.
--
-- Security (mirrors 0002_rls.sql conventions):
--   * RLS on. A user may SELECT only their own rows (auth.uid() = user_id), so
--     the app could show its own usage directly if it ever needs to.
--   * NO insert/update/delete for anon/authenticated: rows are written only by
--     the backend with the service-role key (bypasses RLS) AFTER a successful
--     AI call. A browser can't inflate or erase its own usage.
--   * Rows hold a feature key + timestamp only — no prompts, answers or JDs.
--
-- Counting: public.usage_counts(user, since, feature?) groups this period's
-- events by feature in one indexed scan; the API calls it via PostgREST RPC
-- (POST /rest/v1/rpc/usage_counts) with since = first day of the UTC month.
--
-- FAIL-SAFE: until this migration is applied the API treats usage as unknown
-- and ALLOWS requests (logged once per instance). Nobody is blocked by it.
--
-- Idempotent: safe to re-run.
-- =============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- usage_events — append-only ledger of metered feature uses.
-- ---------------------------------------------------------------------------
create table if not exists public.usage_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  feature     text not null,
  created_at  timestamptz not null default now(),
  constraint usage_events_feature_chk check (
    feature in ('analyses', 'ai_grading', 'voice_mock', 'custom_scenarios', 'story_ai')
  )
);

-- Serves "this user's uses of feature X since the month start" and, by prefix,
-- "all of this user's uses since the month start".
create index if not exists idx_usage_events_user_feature_created
  on public.usage_events (user_id, feature, created_at);

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.usage_events enable row level security;

revoke all on public.usage_events from anon, authenticated;
grant select on public.usage_events to authenticated;

drop policy if exists usage_events_select_own on public.usage_events;
create policy usage_events_select_own on public.usage_events
  for select to authenticated
  using (auth.uid() = user_id);

-- Intentionally NO insert/update/delete policies: writes are service_role only.

-- ---------------------------------------------------------------------------
-- usage_counts — per-feature counts for one user since a timestamp.
--   p_feature null => every feature with at least one use.
-- SECURITY INVOKER: callers are bound by RLS. Execution is granted to
-- service_role (the API) and to authenticated (who, under RLS, can only ever
-- count their own rows regardless of the p_user they pass).
-- ---------------------------------------------------------------------------
create or replace function public.usage_counts(
  p_user    uuid,
  p_since   timestamptz,
  p_feature text default null
)
returns table (feature text, used integer)
language sql
stable
security invoker
set search_path = public
as $$
  select e.feature, count(*)::integer as used
  from public.usage_events e
  where e.user_id = p_user
    and e.created_at >= p_since
    and (p_feature is null or e.feature = p_feature)
  group by e.feature;
$$;

revoke all on function public.usage_counts(uuid, timestamptz, text) from public, anon;
grant execute on function public.usage_counts(uuid, timestamptz, text) to authenticated, service_role;

-- Optional housekeeping (run manually or from a scheduled job): events older
-- than ~13 months are never read by the API.
--   delete from public.usage_events where created_at < now() - interval '13 months';
