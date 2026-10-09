-- OfferReady SaaS — one-time passes and mock-interview credit packs
-- =============================================================================
-- Pricing moved from monthly subscriptions to one-time passes that never
-- auto-renew (api/_lib/passes.js):
--   job      45 days, prep for 1 job
--   pass30   30 days
--   pass90   90 days
--   pass365  365 days
-- Each pass carries a fixed allowance for its WHOLE length (not per month).
-- Buying again before a pass ends starts the new pass when the current one
-- ends, and its allowance is usable straight away.
--
-- Mock packs add voice mock interview credits that never expire. They are
-- spent only after the plan's own allowance is used up.
--
-- Security (same as 0010): RLS on, users may SELECT their own rows, and only
-- the backend (service role, from the verified Stripe webhook) writes.
--
-- FAIL-SAFE until this runs: the API can't read passes, logs once, and falls
-- back to the entitlement rows (a pass still grants Pro content through them).
--
-- Idempotent: safe to re-run.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- passes — one row per purchased pass.
-- ---------------------------------------------------------------------------
create table if not exists public.passes (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  kind               text not null,
  starts_at          timestamptz not null,
  expires_at         timestamptz not null,
  stripe_session_id  text unique,
  stripe_customer_id text,
  created_at         timestamptz not null default now(),
  constraint passes_kind_chk check (kind in ('job', 'pass30', 'pass90', 'pass365')),
  constraint passes_window_chk check (expires_at > starts_at)
);

create index if not exists idx_passes_user_expires on public.passes (user_id, expires_at);

alter table public.passes enable row level security;
revoke all on public.passes from anon, authenticated;
grant select on public.passes to authenticated;
drop policy if exists passes_select_own on public.passes;
create policy passes_select_own on public.passes
  for select to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- credit_ledger — +N when a pack is bought, -1 when a credit is spent.
-- Balance = sum(delta) per (user, feature).
-- ---------------------------------------------------------------------------
create table if not exists public.credit_ledger (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  feature            text not null,
  delta              integer not null,
  source             text,
  stripe_session_id  text unique,
  created_at         timestamptz not null default now(),
  constraint credit_ledger_feature_chk check (feature in ('voice_mock')),
  constraint credit_ledger_delta_chk check (delta <> 0)
);

create index if not exists idx_credit_ledger_user_feature on public.credit_ledger (user_id, feature);

alter table public.credit_ledger enable row level security;
revoke all on public.credit_ledger from anon, authenticated;
grant select on public.credit_ledger to authenticated;
drop policy if exists credit_ledger_select_own on public.credit_ledger;
create policy credit_ledger_select_own on public.credit_ledger
  for select to authenticated using (auth.uid() = user_id);

-- Balance per feature for one user (one indexed scan; called via PostgREST RPC).
create or replace function public.credit_balance(p_user uuid)
returns table (feature text, balance bigint)
language sql stable security definer set search_path = public as $$
  select feature, coalesce(sum(delta), 0)::bigint as balance
  from public.credit_ledger
  where user_id = p_user
  group by feature
$$;

revoke all on function public.credit_balance(uuid) from public, anon, authenticated;
grant execute on function public.credit_balance(uuid) to service_role;
