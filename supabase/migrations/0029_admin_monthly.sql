-- OfferReady — admin dashboard by month.
-- admin_monthly(p_months, p_exclude): one row per calendar month (UTC), newest
-- first, for the last p_months months (1–24), counting the same things as the
-- rest of the admin dashboard:
--   AI:       cost (USD, estimated from tokens), calls, failed calls, users,
--             input / cached / output tokens, and the same per feature;
--   people:   people (signed-in users + anonymous browsers), signed-in people,
--             new accounts, page views;
--   actions:  product events per event name (jobs added, mocks, purchases…);
--   usage:    metered feature uses (usage_events);
--   passes:   passes sold per kind;
--   feedback: count and average rating.
-- p_exclude: lower-case emails (the API passes ADMIN_EMAILS plus
-- METRICS_EXCLUDE_EMAILS) whose accounts, and every browser they signed in on,
-- are left out — the same rule as admin_metrics2 (0023). Pass '{}' to include
-- the team.
-- Numbers only: no prompts, answers, resumes or messages.
-- Only the service role can run it. Idempotent: safe to re-run.


create or replace function public.admin_monthly(p_months int default 12, p_exclude text[] default '{}')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select date_trunc('month', now() at time zone 'utc') - make_interval(months => greatest(1, least(coalesce(p_months, 12), 24)) - 1) as since_m
  ),
  since as (select (since_m at time zone 'utc') as ts from params),
  team as (
    select id from auth.users where lower(email) = any(coalesce(p_exclude, '{}'))
  ),
  team_anon as (
    select distinct anon_id from product_events
    where anon_id is not null and user_id in (select id from team)
  ),
  months as (
    select to_char(m, 'YYYY-MM') as month
    from generate_series((select since_m from params), date_trunc('month', now() at time zone 'utc'), interval '1 month') as m
  ),
  ai as (
    select to_char(created_at at time zone 'utc', 'YYYY-MM') as month, c.*
    from ai_calls c
    where created_at >= (select ts from since) and (user_id is null or user_id not in (select id from team))
  ),
  pe as (
    select to_char(created_at at time zone 'utc', 'YYYY-MM') as month, e.*
    from product_events e
    where created_at >= (select ts from since)
      and (user_id is null or user_id not in (select id from team))
      and (anon_id is null or anon_id not in (select anon_id from team_anon))
  ),
  ue as (
    select to_char(created_at at time zone 'utc', 'YYYY-MM') as month, u.*
    from usage_events u
    where created_at >= (select ts from since) and user_id not in (select id from team)
  ),
  ps as (
    select to_char(created_at at time zone 'utc', 'YYYY-MM') as month, p.*
    from passes p
    where created_at >= (select ts from since) and user_id not in (select id from team)
  ),
  fb as (
    select to_char(created_at at time zone 'utc', 'YYYY-MM') as month, f.*
    from feedback f
    where created_at >= (select ts from since) and (user_id is null or user_id not in (select id from team))
  ),
  au as (
    select to_char(created_at at time zone 'utc', 'YYYY-MM') as month
    from auth.users
    where created_at >= (select ts from since) and id not in (select id from team)
  )
  select coalesce(jsonb_agg(row order by row->>'month' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'month', m.month,
      'ai_cost_usd', (select round(coalesce(sum(cost_usd), 0), 4) from ai where ai.month = m.month),
      'ai_calls', (select count(*) from ai where ai.month = m.month),
      'ai_failed', (select count(*) from ai where ai.month = m.month and not ok),
      'ai_users', (select count(distinct user_id) from ai where ai.month = m.month),
      'input_tokens', (select coalesce(sum(input_tokens), 0) from ai where ai.month = m.month),
      'cached_tokens', (select coalesce(sum(cached_tokens), 0) from ai where ai.month = m.month),
      'output_tokens', (select coalesce(sum(output_tokens), 0) from ai where ai.month = m.month),
      'ai_features', coalesce((select jsonb_agg(f order by (f->>'cost_usd')::numeric desc) from (
          select jsonb_build_object('feature', feature, 'calls', count(*), 'users', count(distinct user_id),
            'cost_usd', round(coalesce(sum(cost_usd), 0), 4), 'failed', count(*) filter (where not ok)) as f
          from ai where ai.month = m.month group by feature) x), '[]'::jsonb),
      'people', (select count(distinct coalesce(user_id::text, anon_id)) from pe where pe.month = m.month),
      'signed_in_people', (select count(distinct user_id) from pe where pe.month = m.month and user_id is not null),
      'new_users', (select count(*) from au where au.month = m.month),
      'page_views', (select count(*) from pe where pe.month = m.month and event = 'page_view'),
      'events', coalesce((select jsonb_object_agg(event, n) from (
          select event, count(*) as n from pe where pe.month = m.month and event <> 'page_view' group by event) x), '{}'::jsonb),
      'usage', coalesce((select jsonb_object_agg(feature, n) from (
          select feature, count(*) as n from ue where ue.month = m.month group by feature) x), '{}'::jsonb),
      'passes', coalesce((select jsonb_object_agg(kind, n) from (
          select kind, count(*) as n from ps where ps.month = m.month group by kind) x), '{}'::jsonb),
      'feedback_count', (select count(*) from fb where fb.month = m.month),
      'feedback_avg', (select round(avg(rating)::numeric, 2) from fb where fb.month = m.month and rating is not null)
    ) as row
    from months m
  ) r;
$$;

revoke all on function public.admin_monthly(int, text[]) from public, anon, authenticated;
grant execute on function public.admin_monthly(int, text[]) to service_role;
