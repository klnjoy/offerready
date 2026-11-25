-- OfferReady — admin counts that match what people actually did (K5/K6).
-- Two fixes, both in the admin SQL functions:
--
-- K5 — signed_in_people counted only accounts that generated a product
--   event in the period, so an account that signed in but never clicked
--   anything read as 0 while People showed it active. It now counts every
--   (non-team) account whose last_sign_in_at falls in the period, or that
--   generated a product event there. admin_metrics (0019), admin_metrics2
--   (0023) and admin_monthly (0029, per month) all get the same rule.
--
-- K6 — ai_users counted distinct user_id over ai_calls, but anonymous AI
--   calls (free previews before sign-in) have NULL user_id, so months with
--   only anonymous calls read 0 users while calls existed. There is no
--   browser/anonymous id on ai_calls rows, so no exact anonymous count is
--   recoverable: anonymous callers count as one "signed-out" person per
--   month (admin_monthly) and per feature (admin_monthly ai_features and
--   ai_cost_summary, used by /admin/costs) — a documented lower bound, not
--   an exact count. Exact anonymous tracking would need ai_calls to carry
--   the anon id (follow-up, not this migration).
--
-- The "AI usage (metered)" table on the dashboard reads usage_events, not
-- ai_calls: it is empty while /admin/costs shows calls because no non-team
-- account has metered usage yet. That is correct behaviour, not a bug, so
-- nothing changes there.
-- Only the service role can run these. Idempotent: safe to re-run.

-- Per-feature totals since a point in time (was 0017).
-- K6: +1 "signed-out" person per feature when any call that period has a
-- NULL user_id (anonymous preview calls carry no user id).
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
    count(distinct c.user_id)
      + coalesce(max(case when c.user_id is null then 1 else 0 end), 0) as users,
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

-- Admin metrics in one call (was 0019).
-- K5: signed_in_people counts accounts that signed in in the period, not
-- only accounts that generated a product event there.
create or replace function public.admin_metrics(p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'people', (select count(distinct coalesce(user_id::text, anon_id)) from product_events where created_at >= p_since),
    'signed_in_people', (select count(*) from auth.users au where au.last_sign_in_at >= p_since or exists (select 1 from product_events pe where pe.user_id = au.id and pe.created_at >= p_since)),
    'new_users', (select count(*) from auth.users where created_at >= p_since),
    'total_users', (select count(*) from auth.users),
    'daily', coalesce((select jsonb_agg(d order by d->>'day') from (
        select jsonb_build_object('day', to_char(date_trunc('day', created_at), 'YYYY-MM-DD'),
          'people', count(distinct coalesce(user_id::text, anon_id)), 'events', count(*)) as d
        from product_events where created_at >= p_since group by date_trunc('day', created_at)) x), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(e order by (e->>'count')::bigint desc) from (
        select jsonb_build_object('event', event, 'count', count(*), 'people', count(distinct coalesce(user_id::text, anon_id))) as e
        from product_events where created_at >= p_since group by event) x), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(p order by (p->>'views')::bigint desc) from (
        select jsonb_build_object('route', coalesce(route, '?'), 'views', count(*), 'people', count(distinct coalesce(user_id::text, anon_id))) as p
        from product_events where created_at >= p_since and event = 'page_view' group by route order by count(*) desc limit 25) x), '[]'::jsonb),
    'usage', coalesce((select jsonb_agg(u order by (u->>'uses')::bigint desc) from (
        select jsonb_build_object('feature', feature, 'uses', count(*), 'users', count(distinct user_id)) as u
        from usage_events where created_at >= p_since group by feature) x), '[]'::jsonb),
    'passes', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'sold', n)) from (
        select kind, count(*) as n from passes where created_at >= p_since group by kind) x), '[]'::jsonb),
    'feedback_count', (select count(*) from feedback where created_at >= p_since),
    'feedback_avg', (select round(avg(rating)::numeric, 2) from feedback where created_at >= p_since and rating is not null),
    'feedback', coalesce((select jsonb_agg(f order by f->>'at' desc) from (
        select jsonb_build_object('at', created_at, 'rating', rating, 'message', left(message, 600), 'route', route, 'signed_in', user_id is not null, 'contact_ok', contact_ok) as f
        from feedback where created_at >= p_since order by created_at desc limit 40) x), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_metrics(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_metrics(timestamptz) to service_role;

-- Admin dashboard without the team's own activity (was 0023).
-- K5: signed_in_people counts non-team accounts that signed in in the
-- period (au.last_sign_in_at), or generated a product event there.
create or replace function public.admin_metrics2(p_since timestamptz, p_exclude text[] default '{}')
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
    where anon_id is not null and user_id in (select id from team)
  ),
  pe as (
    select * from product_events
    where created_at >= p_since
      and (user_id is null or user_id not in (select id from team))
      and (anon_id is null or anon_id not in (select anon_id from team_anon))
  ),
  au as (select * from auth.users where id not in (select id from team)),
  fb as (
    select * from feedback
    where created_at >= p_since and (user_id is null or user_id not in (select id from team))
  )
  select jsonb_build_object(
    'people', (select count(distinct coalesce(user_id::text, anon_id)) from pe),
    'signed_in_people', (select count(*) from au where au.last_sign_in_at >= p_since or exists (select 1 from pe where pe.user_id = au.id)),
    'new_users', (select count(*) from au where created_at >= p_since),
    'total_users', (select count(*) from au),
    'excluded_accounts', (select count(*) from team),
    'daily', coalesce((select jsonb_agg(d order by d->>'day') from (
        select jsonb_build_object('day', to_char(date_trunc('day', created_at), 'YYYY-MM-DD'),
          'people', count(distinct coalesce(user_id::text, anon_id)), 'events', count(*)) as d
        from pe group by date_trunc('day', created_at)) x), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(e order by (e->>'count')::bigint desc) from (
        select jsonb_build_object('event', event, 'count', count(*), 'people', count(distinct coalesce(user_id::text, anon_id))) as e
        from pe group by event) x), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(p order by (p->>'views')::bigint desc) from (
        select jsonb_build_object('route', coalesce(route, '?'), 'views', count(*), 'people', count(distinct coalesce(user_id::text, anon_id))) as p
        from pe where event = 'page_view' group by route order by count(*) desc limit 25) x), '[]'::jsonb),
    'usage', coalesce((select jsonb_agg(u order by (u->>'uses')::bigint desc) from (
        select jsonb_build_object('feature', feature, 'uses', count(*), 'users', count(distinct user_id)) as u
        from usage_events where created_at >= p_since and (user_id is null or user_id not in (select id from team))
        group by feature) x), '[]'::jsonb),
    'passes', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'sold', n)) from (
        select kind, count(*) as n from passes
        where created_at >= p_since and (user_id is null or user_id not in (select id from team))
        group by kind) x), '[]'::jsonb),
    'feedback_count', (select count(*) from fb),
    'feedback_avg', (select round(avg(rating)::numeric, 2) from fb where rating is not null),
    'feedback', coalesce((select jsonb_agg(f order by f->>'at' desc) from (
        select jsonb_build_object('at', created_at, 'rating', rating, 'message', left(message, 600), 'route', route, 'signed_in', user_id is not null, 'contact_ok', contact_ok) as f
        from fb order by created_at desc limit 40) x), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_metrics2(timestamptz, text[]) from public, anon, authenticated;
grant execute on function public.admin_metrics2(timestamptz, text[]) to service_role;

-- Admin dashboard by month (was 0029).
-- K5: signed_in_people per month counts non-team accounts whose
-- last_sign_in_at falls in that month, or that generated a product event
-- there. K6: ai_users and per-feature users count anonymous calls as one
-- "signed-out" person (see the header comment).
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
      'ai_users', (select count(distinct user_id) + coalesce(max(case when user_id is null then 1 else 0 end), 0) from ai where ai.month = m.month),
      'input_tokens', (select coalesce(sum(input_tokens), 0) from ai where ai.month = m.month),
      'cached_tokens', (select coalesce(sum(cached_tokens), 0) from ai where ai.month = m.month),
      'output_tokens', (select coalesce(sum(output_tokens), 0) from ai where ai.month = m.month),
      'ai_features', coalesce((select jsonb_agg(f order by (f->>'cost_usd')::numeric desc) from (
          select jsonb_build_object('feature', feature, 'calls', count(*), 'users', count(distinct user_id) + max(case when user_id is null then 1 else 0 end),
            'cost_usd', round(coalesce(sum(cost_usd), 0), 4), 'failed', count(*) filter (where not ok)) as f
          from ai where ai.month = m.month group by feature) x), '[]'::jsonb),
      'people', (select count(distinct coalesce(user_id::text, anon_id)) from pe where pe.month = m.month),
      'signed_in_people', (select count(*) from (
          select user_id from pe where pe.month = m.month and user_id is not null
          union
          select id from auth.users where id not in (select id from team)
            and to_char(last_sign_in_at at time zone 'utc', 'YYYY-MM') = m.month
        ) s),
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
