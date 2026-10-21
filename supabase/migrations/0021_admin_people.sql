-- OfferReady — admin people list (GET /api/me/plan?op=people).
-- Who the people behind the dashboard numbers are:
--   users:    every account (email, name, sign-in method, sign-up and last
--             activity, jobs saved, AI uses, passes and mock packs bought).
--   visitors: people who used the app without signing in during the period.
--             We never collect their name or email, so they are shown by a
--             short anonymous id with when they came and which pages they saw.
-- No job, resume or answer content is read. Only the service role can run it,
-- and the API returns it to ADMIN_EMAILS only.
-- Idempotent: safe to re-run.

create or replace function public.admin_people(p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
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
        -- Never signed in on this browser (otherwise they are in "users").
        and not exists (select 1 from product_events s where s.anon_id = pe.anon_id and s.user_id is not null)
      group by pe.anon_id
      order by max(pe.created_at) desc
      limit 300) y), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_people(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_people(timestamptz) to service_role;
