-- Daily "your next step" email (opt-in only).
--
-- email_daily_optin: one row per person who turned on "Email me my next step
-- each morning" in Account. Turning it off deletes the row. The API writes it
-- with the service role for the signed-in user; nobody else can read it.
--
-- daily_step_people() returns the people who opted in and may get today's
-- email: confirmed email, not unsubscribed, with their latest job and when
-- they last practised (an AI call or a practice session). The API decides who
-- actually gets one (lib/emails.js pickDaily). Sends are recorded in
-- email_sends (migration 0027) as kind 'daily:YYYY-MM-DD'.

create table if not exists public.email_daily_optin (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.email_daily_optin enable row level security;
revoke all on table public.email_daily_optin from public, anon, authenticated;

create or replace function public.daily_step_people(p_exclude text[], p_user uuid default null)
returns table (
  user_id     uuid,
  email       text,
  first_name  text,
  job_id      uuid,
  job_title   text,
  job_company text,
  last_active timestamptz,
  optin_at    timestamptz,
  sent        text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    au.id,
    au.email::text,
    nullif(split_part(trim(coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', '')), ' ', 1), ''),
    j.id, j.title, j.company,
    greatest(
      (select max(c.created_at) from ai_calls c where c.user_id = au.id),
      (select max(ps.created_at) from practice_sessions ps where ps.user_id = au.id)
    ),
    o.created_at,
    coalesce((select array_agg(s.kind order by s.kind) from email_sends s
              where s.user_id = au.id and s.kind like 'daily:%' and s.sent_at > now() - interval '30 days'), '{}'::text[])
  from email_daily_optin o
  join auth.users au on au.id = o.user_id
  left join lateral (
    select jb.id, jb.title, jb.company from jobs jb
    where jb.user_id = au.id order by jb.created_at desc limit 1
  ) j on true
  where au.email is not null
    and au.email_confirmed_at is not null
    and (p_user is null or au.id = p_user)
    and lower(au.email::text) <> all (coalesce(p_exclude, '{}'::text[]))
    and not exists (select 1 from email_unsubscribes u where u.user_id = au.id)
  limit 5000;
$$;

revoke all on function public.daily_step_people(text[], uuid) from public, anon, authenticated;
grant execute on function public.daily_step_people(text[], uuid) to service_role;
