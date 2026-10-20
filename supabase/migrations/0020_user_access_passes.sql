-- OfferReady — user_access_passes (recorded from the Supabase SQL editor,
-- where it was run by hand while setting up Stripe on 20 Oct 2026).
--
-- Note: the app does not read or write this table. Passes are stored in
-- public.passes (0014_passes.sql), written by the Stripe webhook. This file
-- keeps the repo in step with the database so a fresh setup matches it.
-- Idempotent: safe to re-run.

create table if not exists public.user_access_passes (
  stripe_session_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  paid_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists user_access_passes_user_expiry_idx
  on public.user_access_passes (user_id, expires_at);

alter table public.user_access_passes enable row level security;

drop policy if exists "Users can view their own access passes"
  on public.user_access_passes;

create policy "Users can view their own access passes"
  on public.user_access_passes
  for select
  to authenticated
  using (auth.uid() = user_id);
