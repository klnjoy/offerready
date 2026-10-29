-- OfferReady — admin funnel: where people drop off.
-- For the period, counts BROWSERS (anon_id, so someone who signs in half way
-- stays one person) that reached each step: visited, opened Add a job,
-- submitted a job, were asked to sign in, signed in, saw an analysis, saved a
-- job, practised; plus how many came back on another day. Team accounts,
-- their browsers and visitors an admin hid are left out, exactly as in the
-- other admin numbers (0023/0024). Read-only; only the service role can run
-- it. Idempotent: safe to re-run (it also creates the 0024 table if missing).

create table if not exists public.admin_hidden_visitors (
  id          text primary key check (id ~ '^[a-z0-9]{8}$'),
  hidden_by   text,
  created_at  timestamptz not null default now()
);
alter table public.admin_hidden_visitors enable row level security;
revoke all on table public.admin_hidden_visitors from public, anon, authenticated;
grant select, insert, delete on table public.admin_hidden_visitors to service_role;

create or replace function public.admin_funnel2(p_since timestamptz, p_exclude text[] default '{}')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with team as (
    select id from auth.users where lower(email) = any(coalesce(p_exclude, '{}'))
  ),
  team_anon as (
    select distinct anon_id from product_events
    where anon_id is not null
      and (user_id in (select id from team)
           or left(anon_id, 8) in (select id from public.admin_hidden_visitors))
  ),
  pe as (
    select anon_id, event, route, created_at from product_events
    where created_at >= p_since
      and anon_id is not null
      and anon_id not in (select anon_id from team_anon)
      and (user_id is null or user_id not in (select id from team))
  ),
  b as (
    select anon_id,
      bool_or(event = 'page_view') as visited,
      bool_or(event = 'page_view' and route = '/analyze') as opened_add,
      bool_or(event = 'analyze_submitted') as submitted,
      bool_or(event = 'signin_gate_shown') as asked_sign_in,
      bool_or(event = 'signed_in') as signed_in,
      bool_or(event = 'analysis_shown') as saw_analysis,
      bool_or(event = 'job_added') as saved_job,
      bool_or(event in ('question_practised', 'session_started', 'answer_spoken', 'mock_started', 'ai_check_done')) as practised,
      count(distinct date_trunc('day', created_at)) as days
    from pe
    group by anon_id
  )
  select jsonb_build_object(
    'visited',       count(*) filter (where visited),
    'opened_add',    count(*) filter (where opened_add),
    'submitted',     count(*) filter (where submitted),
    'asked_sign_in', count(*) filter (where asked_sign_in),
    'signed_in',     count(*) filter (where signed_in),
    'saw_analysis',  count(*) filter (where saw_analysis),
    'saved_job',     count(*) filter (where saved_job),
    'practised',     count(*) filter (where practised),
    'came_back',     count(*) filter (where days >= 2)
  ) from b;
$$;

revoke all on function public.admin_funnel2(timestamptz, text[]) from public, anon, authenticated;
grant execute on function public.admin_funnel2(timestamptz, text[]) to service_role;
