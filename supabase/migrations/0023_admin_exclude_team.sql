-- OfferReady — admin dashboard without the team's own activity.
-- Same numbers as admin_metrics / admin_people / admin_plans_geo (0019, 0021,
-- 0022), with one extra argument: p_exclude, a list of lower-case emails
-- (the API passes ADMIN_EMAILS plus METRICS_EXCLUDE_EMAILS). Those accounts,
-- and every browser they have signed in on (its anonymous visits included),
-- are left out of people, sign-ups, events, pages, AI use, passes, feedback,
-- plans and places, so the dashboard shows real users only. Places also
-- carry the days (UTC) people from there used the app.
-- Admin access itself is unchanged: it is still decided by ADMIN_EMAILS.
-- The 0019/0021/0022 functions are kept; the API falls back to them when
-- this migration has not been applied yet.
-- Only the service role can run these. Idempotent: safe to re-run.

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
    'signed_in_people', (select count(distinct user_id) from pe where user_id is not null),
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

create or replace function public.admin_people2(p_since timestamptz, p_exclude text[] default '{}')
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
  )
  select jsonb_build_object(
    'excluded_accounts', (select count(*) from team),
    'users', coalesce((select jsonb_agg(u order by (u->>'last_seen') desc nulls last, (u->>'created_at') desc) from (
      select jsonb_build_object(
        'id', au.id,
        'email', au.email,
        'name', coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', au.raw_user_meta_data->>'user_name'),
        'provider', au.raw_app_meta_data->>'provider',
        'created_at', au.created_at,
        'last_sign_in_at', au.last_sign_in_at,
        'confirmed', au.email_confirmed_at is not null,
        'last_seen', (select max(pe.created_at) from product_events pe where pe.user_id = au.id),
        'events', (select count(*) from product_events pe where pe.user_id = au.id and pe.created_at >= p_since),
        'jobs', (select count(*) from jobs j where j.user_id = au.id),
        'ai_uses', (select count(*) from usage_events ue where ue.user_id = au.id and ue.created_at >= p_since),
        'passes', coalesce((select jsonb_agg(jsonb_build_object('kind', p.kind, 'bought', p.created_at, 'expires', p.expires_at) order by p.created_at desc)
                            from passes p where p.user_id = au.id), '[]'::jsonb),
        'packs', (select count(*) from credit_ledger cl where cl.user_id = au.id and cl.delta > 0 and cl.stripe_session_id is not null),
        'pack_credits', coalesce((select sum(cl.delta) from credit_ledger cl where cl.user_id = au.id), 0),
        'feedback', (select count(*) from feedback f where f.user_id = au.id)
      ) as u
      from auth.users au
      where au.id not in (select id from team)
      order by au.created_at desc
      limit 500) x), '[]'::jsonb),
    'visitors', coalesce((select jsonb_agg(v order by v->>'last_seen' desc) from (
      select jsonb_build_object(
        'id', left(pe.anon_id, 8),
        'first_seen', min(pe.created_at),
        'last_seen', max(pe.created_at),
        'events', count(*),
        'page_views', count(*) filter (where pe.event = 'page_view'),
        'sessions', count(distinct pe.session_id),
        'pages', (select jsonb_agg(r) from (
            select coalesce(p2.route, '?') as r from product_events p2
            where p2.anon_id = pe.anon_id and p2.event = 'page_view' and p2.created_at >= p_since
            group by p2.route order by count(*) desc limit 6) rr)
      ) as v
      from product_events pe
      where pe.created_at >= p_since
        and pe.user_id is null
        and pe.anon_id not in (select anon_id from team_anon)
        -- Never signed in on this browser (otherwise they are in "users").
        and not exists (select 1 from product_events s where s.anon_id = pe.anon_id and s.user_id is not null)
      group by pe.anon_id
      order by max(pe.created_at) desc
      limit 300) y), '[]'::jsonb)
  );
$$;

create or replace function public.admin_plans_geo2(p_since timestamptz, p_exclude text[] default '{}')
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
  u as (
    select
      au.id,
      au.created_at,
      (select p.kind from passes p
         where p.user_id = au.id and p.starts_at <= now() and p.expires_at > now()
         order by p.expires_at desc limit 1) as live_pass,
      exists (select 1 from user_access_passes a where a.user_id = au.id and a.expires_at > now()) as access_pass,
      exists (select 1 from passes p where p.user_id = au.id) as ever_pass,
      exists (select 1 from entitlements e
                where e.user_id = au.id and e.status = 'active'
                  and (e.expires_at is null or e.expires_at > now())) as subscribed,
      coalesce((select sum(c.delta) from credit_ledger c where c.user_id = au.id), 0) as credits
    from auth.users au
    where au.id not in (select id from team)
  ),
  b as (
    select
      case
        when live_pass is not null then 'pass:' || live_pass
        when access_pass then 'access_pass'
        when subscribed then 'subscription'
        when created_at > now() - interval '7 days' then 'trial'
        when ever_pass then 'free_after_pass'
        else 'free'
      end as plan,
      credits > 0 as has_credits
    from u
  ),
  -- Page views in the period with their place and day (UTC), team left out.
  gpe as (
    select
      coalesce(nullif(pe.props->>'country', ''), '?') as country,
      coalesce(pe.props->>'region', '') as region,
      coalesce(pe.user_id::text, pe.anon_id) as who,
      pe.anon_id,
      pe.user_id is null
        and not exists (select 1 from product_events s where s.anon_id = pe.anon_id and s.user_id is not null) as never_signed_in,
      to_char(date_trunc('day', pe.created_at), 'YYYY-MM-DD') as day
    from product_events pe
    where pe.created_at >= p_since and pe.event = 'page_view'
      and (pe.user_id is null or pe.user_id not in (select id from team))
      and (pe.anon_id is null or pe.anon_id not in (select anon_id from team_anon))
  )
  select jsonb_build_object(
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object('plan', plan, 'users', n, 'with_credits', c) order by n desc)
      from (select plan, count(*) as n, count(*) filter (where has_credits) as c from b group by plan) x
    ), '[]'::jsonb),
    'geo', coalesce((
      select jsonb_agg(jsonb_build_object('country', country, 'region', region, 'people', people, 'visitors', visitors,
                                          'last_seen', last_seen, 'days', days) order by people desc)
      from (
        select
          g.country, g.region,
          count(distinct g.who) as people,
          count(distinct g.anon_id) filter (where g.never_signed_in) as visitors,
          max(g.day) as last_seen,
          (select jsonb_agg(jsonb_build_object('day', d, 'people', c) order by d desc)
             from (select g2.day as d, count(distinct g2.who) as c from gpe g2
                   where g2.country = g.country and g2.region = g.region group by g2.day) z) as days
        from gpe g
        group by g.country, g.region
        order by 3 desc
        limit 80
      ) x
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_metrics2(timestamptz, text[]) from public, anon, authenticated;
revoke all on function public.admin_people2(timestamptz, text[]) from public, anon, authenticated;
revoke all on function public.admin_plans_geo2(timestamptz, text[]) from public, anon, authenticated;
grant execute on function public.admin_metrics2(timestamptz, text[]) to service_role;
grant execute on function public.admin_people2(timestamptz, text[]) to service_role;
grant execute on function public.admin_plans_geo2(timestamptz, text[]) to service_role;
