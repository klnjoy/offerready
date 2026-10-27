-- OfferReady — admin dashboard: people by plan, and visitors by place.
-- Read by GET /api/me/plan?op=metrics (ADMIN_EMAILS only).
--   plans: every account counted once, in its current plan:
--          pass:<kind> (a live pass), access_pass (a live paid access
--          window), subscription (an active Pro entitlement), trial (signed
--          up in the last 7 days, nothing bought), free_after_pass (a pass
--          that has ended), or free. with_credits = also holds mock credits.
--   geo:   people in the period by country and region, from the coarse
--          location the app adds to page views (no IP address or city is
--          stored). visitors = of those, people who never signed in.
-- Only the service role can run it. Idempotent: safe to re-run.

create or replace function public.admin_plans_geo(p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with u as (
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
  )
  select jsonb_build_object(
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object('plan', plan, 'users', n, 'with_credits', c) order by n desc)
      from (select plan, count(*) as n, count(*) filter (where has_credits) as c from b group by plan) x
    ), '[]'::jsonb),
    'geo', coalesce((
      select jsonb_agg(jsonb_build_object('country', country, 'region', region, 'people', people, 'visitors', visitors) order by people desc)
      from (
        select
          coalesce(nullif(pe.props->>'country', ''), '?') as country,
          coalesce(pe.props->>'region', '') as region,
          count(distinct coalesce(pe.user_id::text, pe.anon_id)) as people,
          count(distinct pe.anon_id) filter (
            where pe.user_id is null
              and not exists (select 1 from product_events s where s.anon_id = pe.anon_id and s.user_id is not null)
          ) as visitors
        from product_events pe
        where pe.created_at >= p_since and pe.event = 'page_view'
        group by 1, 2
        order by 3 desc
        limit 80
      ) g
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_plans_geo(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_plans_geo(timestamptz) to service_role;
