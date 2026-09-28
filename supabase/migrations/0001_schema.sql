-- OfferReady SaaS — core schema (Phase 2)
-- =============================================================================
-- Postgres / Supabase. Creates the user-state, subscription, entitlement, and
-- premium-content tables (spec §12). RLS is enabled + policied in 0002_rls.sql.
--
-- Design principles:
--   * All user rows key off auth.users(id) via a FK (ON DELETE CASCADE).
--   * Access is granted by FEATURE entitlements, never a raw plan flag (§13).
--   * Stripe webhooks are the source of subscription truth; webhook_events
--     gives us idempotency (§18).
--   * Timestamps are timestamptz; updated_at maintained by a trigger.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / CREATE OR REPLACE).
-- =============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Stripe subscription lifecycle states we explicitly handle (§19). Note we do
-- NOT treat every state as "Pro" — the entitlement layer decides access.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type subscription_status as enum (
      'active',
      'trialing',
      'past_due',
      'canceled',
      'unpaid',
      'incomplete',
      'incomplete_expired',
      'paused'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'plan_tier') then
    create type plan_tier as enum ('free', 'pro');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'entitlement_status') then
    create type entitlement_status as enum ('active', 'revoked', 'expired');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user (public-facing account data)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  plan         plan_tier not null default 'free',  -- convenience mirror; NOT authz
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- subscriptions — mirror of Stripe subscription state (§12)
-- One active subscription per user in V1; keyed by user_id for simple lookups.
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text unique,
  stripe_price_id        text,
  plan                   plan_tier not null default 'pro',
  status                 subscription_status not null,
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  canceled_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists idx_subscriptions_user on public.subscriptions(user_id);
create index if not exists idx_subscriptions_customer on public.subscriptions(stripe_customer_id);

drop trigger if exists trg_subscriptions_updated on public.subscriptions;
create trigger trg_subscriptions_updated
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- entitlements — feature-level access (§13). Access checks read THIS table,
-- not plan="pro". A Pro subscription grants a set of feature rows.
-- ---------------------------------------------------------------------------
create table if not exists public.entitlements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  feature    text not null,                       -- e.g. interview_pro, fde_pro
  status     entitlement_status not null default 'active',
  expires_at timestamptz,                          -- null = no time limit
  source     text,                                 -- e.g. 'stripe:sub_123'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, feature)
);
create index if not exists idx_entitlements_user on public.entitlements(user_id);

drop trigger if exists trg_entitlements_updated on public.entitlements;
create trigger trg_entitlements_updated
  before update on public.entitlements
  for each row execute function public.set_updated_at();

-- Known feature keys (documentation table; not enforced as FK so new features
-- can be added without a migration). Seeded for reference / admin UIs.
create table if not exists public.features (
  key         text primary key,
  label       text not null,
  description text
);
insert into public.features (key, label, description) values
  ('interview_pro',      'Interview Pro',       'Full interview simulator + complete question library'),
  ('simulator_pro',      'Simulator Pro',       'Master interview simulator, unlimited runs'),
  ('fde_pro',            'FDE Pro',             'Advanced Forward Deployed Engineer customer scenarios'),
  ('incident_pro',       'Incident Pro',        'Production incident interview scenarios'),
  ('system_design_pro',  'System Design Pro',   'Requirements to Production + senior system design'),
  ('architecture_pro',   'Architecture Pro',    'AI architecture scenarios and trade-offs'),
  ('progress_pro',       'Progress Pro',        'Progress tracking, weak-area detection, next drills')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- premium_content — server-side store for gated content (§12, §21).
-- The PUBLIC static site must NOT contain these bodies; they are served only
-- through the authorized premium API after an entitlement check.
-- ---------------------------------------------------------------------------
create table if not exists public.premium_content (
  slug                 text primary key,
  title                text not null,
  category             text,                       -- why_chain | incident | fde | system_design | ...
  required_entitlement text not null,              -- feature key required to read `content`
  teaser               text,                        -- safe-to-show marketing/sample (may be public)
  content              jsonb not null default '{}', -- full premium body / scenario tree (PROTECTED)
  published            boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists idx_premium_content_category on public.premium_content(category);
create index if not exists idx_premium_content_published on public.premium_content(published);

drop trigger if exists trg_premium_content_updated on public.premium_content;
create trigger trg_premium_content_updated
  before update on public.premium_content
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- practice_sessions — a user's run through a scenario/quiz (§12, §23)
-- ---------------------------------------------------------------------------
create table if not exists public.practice_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  content_slug  text references public.premium_content(slug) on delete set null,
  category      text,
  mode          text,                              -- scenario | why_chain | incident | quiz
  state         jsonb not null default '{}',        -- engine state (answers, current node)
  score         integer,                            -- optional 0-100 self/auto rating
  completed     boolean not null default false,
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_practice_sessions_user on public.practice_sessions(user_id);

drop trigger if exists trg_practice_sessions_updated on public.practice_sessions;
create trigger trg_practice_sessions_updated
  before update on public.practice_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_progress — measurable progress per category (§22: no invented score)
-- ---------------------------------------------------------------------------
create table if not exists public.user_progress (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  category             text not null,              -- rag | agents | system_design | fde | incidents | architecture
  scenarios_completed  integer not null default 0,
  sessions_count       integer not null default 0,
  last_score           integer,
  weak                 boolean not null default false,
  last_practiced_at    timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, category)
);
create index if not exists idx_user_progress_user on public.user_progress(user_id);

drop trigger if exists trg_user_progress_updated on public.user_progress;
create trigger trg_user_progress_updated
  before update on public.user_progress
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- webhook_events — Stripe event idempotency ledger (§18). Service-role only.
-- ---------------------------------------------------------------------------
create table if not exists public.webhook_events (
  id           text primary key,                   -- Stripe event id (evt_...)
  type         text not null,
  processed_at timestamptz,
  status       text not null default 'received',   -- received | processed | failed
  payload      jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists idx_webhook_events_type on public.webhook_events(type);
