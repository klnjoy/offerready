-- OfferReady — invite friends: one personal code per account, +1 mock
-- credit for the inviter AND the friend when the friend signs up with it
-- (api/_lib/referrals.js, GET/POST /api/me/plan?op=referral*).
-- =============================================================================
-- referral_codes — one row per account, created on first ask. The code is
-- 8 random chars from an alphabet with no 0/O, 1/I/L, so it survives being
-- read out loud and typed from a phone screen.
--
-- referral_redemptions — one row per friend who joined with a code. The
-- unique invitee_user_id is the backstop that pays out at most once per new
-- account (the first check is billing.claimOnce on 'referral:<invitee>').
--
-- Credit grants reuse public.credit_ledger (migration 0014): +1 'voice_mock'
-- for the inviter (source referral:inviter:<invitee>) and +1 for the friend
-- (source referral:invitee:<invitee>). The source carries the invitee id so
-- each side's grant is idempotent on its own — a retry after a partial
-- failure never grants the same side twice.
--
-- Security (same as 0014): RLS on, users may SELECT their own rows, and only
-- the backend (service role) writes.
--
-- FAIL-SAFE until this runs: GET /api/me/plan?op=referral answers 503
-- { setup: true } and the invite page says the link isn't ready yet.
--
-- Idempotent: safe to re-run.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- referral_codes — one invite code per account.
-- ---------------------------------------------------------------------------
create table if not exists public.referral_codes (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  code       text not null unique,
  created_at timestamptz not null default now(),
  constraint referral_codes_code_chk check (code ~ '^[A-Z2-9]{8}$')
);

create index if not exists idx_referral_codes_code on public.referral_codes (code);

alter table public.referral_codes enable row level security;
revoke all on public.referral_codes from anon, authenticated;
grant select on public.referral_codes to authenticated;
drop policy if exists referral_codes_select_own on public.referral_codes;
create policy referral_codes_select_own on public.referral_codes
  for select to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- referral_redemptions — one row per friend who joined with a code.
-- ---------------------------------------------------------------------------
create table if not exists public.referral_redemptions (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,
  inviter_user_id  uuid not null references auth.users(id) on delete cascade,
  invitee_user_id  uuid not null unique references auth.users(id) on delete cascade,
  created_at       timestamptz not null default now(),
  granted_at       timestamptz
);

create index if not exists idx_referral_redemptions_inviter on public.referral_redemptions (inviter_user_id, created_at desc);

alter table public.referral_redemptions enable row level security;
revoke all on public.referral_redemptions from anon, authenticated;
grant select on public.referral_redemptions to authenticated;
drop policy if exists referral_redemptions_select_own on public.referral_redemptions;
create policy referral_redemptions_select_own on public.referral_redemptions
  for select to authenticated using (auth.uid() = inviter_user_id or auth.uid() = invitee_user_id);
