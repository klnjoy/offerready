-- OfferReady SaaS — AI cost log ('ai_calls') and a per-feature summary
-- =============================================================================
-- One row per OpenAI call made by the API (api/_lib/aiCost.js): which feature,
-- which model, tokens in / cached / out, estimated cost in USD and how long it
-- took. Numbers only: no prompts, answers, resumes or job descriptions.
--
-- Access model:
--   * RLS on, no grants to anon/authenticated: rows are written and read only
--     by the backend with the service-role key, and in the Supabase dashboard.
--   * Deleting an account keeps the cost rows but clears user_id.
--
-- Summary (used by the admin cost view, GET /api/me/plan?op=costs):
--   select * from public.ai_cost_summary(now() - interval '30 days');
--
-- Idempotent: safe to re-run.
-- =============================================================================

create table if not exists public.ai_calls (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  user_id        uuid null references auth.users (id) on delete set null,
  feature        text not null,
  model          text not null,
  input_tokens   integer not null default 0,
  cached_tokens  integer not null default 0,
  output_tokens  integer not null default 0,
  cost_usd       numeric(12, 6) not null default 0,
  priced         boolean not null default true,
  ms             integer not null default 0,
  ok             boolean not null default true
);

alter table public.ai_calls drop constraint if exists ai_calls_feature_chk;
alter table public.ai_calls drop constraint if exists ai_calls_model_chk;
alter table public.ai_calls drop constraint if exists ai_calls_tokens_chk;
alter table public.ai_calls
  add constraint ai_calls_feature_chk check (feature ~ '^[a-z][a-z0-9_]{1,39}$'),
  add constraint ai_calls_model_chk   check (char_length(model) between 1 and 80),
  add constraint ai_calls_tokens_chk  check (input_tokens >= 0 and cached_tokens >= 0 and output_tokens >= 0 and cached_tokens <= input_tokens);

create index if not exists ai_calls_created_idx on public.ai_calls (created_at desc);
create index if not exists ai_calls_feature_idx on public.ai_calls (feature, created_at desc);

alter table public.ai_calls enable row level security;
revoke all on public.ai_calls from anon, authenticated;
-- No policies on purpose: service role (backend + dashboard) only.

-- Per-feature totals since a point in time.
create or replace function public.ai_cost_summary(p_since timestamptz)
returns table (
  feature        text,
  calls          bigint,
  users          bigint,
  input_tokens   bigint,
  cached_tokens  bigint,
  output_tokens  bigint,
  cost_usd       numeric,
  avg_cost_usd   numeric,
  avg_ms         numeric,
  failed         bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.feature,
    count(*)                                   as calls,
    count(distinct c.user_id)                  as users,
    coalesce(sum(c.input_tokens), 0)           as input_tokens,
    coalesce(sum(c.cached_tokens), 0)          as cached_tokens,
    coalesce(sum(c.output_tokens), 0)          as output_tokens,
    round(coalesce(sum(c.cost_usd), 0), 6)     as cost_usd,
    round(coalesce(avg(c.cost_usd), 0), 6)     as avg_cost_usd,
    round(coalesce(avg(c.ms), 0), 0)           as avg_ms,
    count(*) filter (where not c.ok)           as failed
  from public.ai_calls c
  where c.created_at >= p_since
  group by c.feature
  order by sum(c.cost_usd) desc;
$$;

revoke all on function public.ai_cost_summary(timestamptz) from public, anon, authenticated;
