-- OfferReady — admin metrics in one call (GET /api/me/plan?op=metrics).
-- One SQL function returns everything the admin dashboard shows for a period:
-- people, sign-ups, events (feature use and clicks), page views, the funnel,
-- feedback, metered AI usage and passes sold. Only the service role can run it.
-- No content is read: product_events never carries any, and feedback messages
-- are returned only to admins (they are user-written, meant for us).
-- Idempotent: safe to re-run.

create or replace function public.admin_metrics(p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'people', (select count(distinct coalesce(user_id::text, anon_id)) from product_events where created_at >= p_since),
    'signed_in_people', (select count(distinct user_id) from product_events where created_at >= p_since and user_id is not null),
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
