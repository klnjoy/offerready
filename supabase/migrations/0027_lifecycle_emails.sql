-- OfferReady — welcome, follow-up and monthly update emails.
-- email_sends records every email sent: one row per person per kind
-- ('welcome', 'nudge_job', 'practice', 'plans', 'monthly:2026-11', ...).
-- The API claims the row before it sends, so each email goes out at most once
-- even if the daily run happens twice.
-- email_unsubscribes lists people who chose not to get these emails. Once
-- someone is listed here, nothing is sent to them.
-- email_people() returns the people who may get an email: confirmed email
-- address, not on the team list, not unsubscribed, and confirmed on or after
-- p_since. It also says whether each person has a job saved, has practised or
-- has paid, and which emails they already got. Only the service role can use
-- these. Emails from Supabase sign-in (confirm, reset password) are not
-- affected.
-- Idempotent: safe to re-run.

create table if not exists public.email_sends (
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (char_length(kind) between 1 and 40),
  sent_at    timestamptz not null default now(),
  provider_id text,
  primary key (user_id, kind)
);
alter table public.email_sends enable row level security;
revoke all on table public.email_sends from public, anon, authenticated;

create table if not exists public.email_unsubscribes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  at      timestamptz not null default now(),
  source  text
);
alter table public.email_unsubscribes enable row level security;
revoke all on table public.email_unsubscribes from public, anon, authenticated;

create or replace function public.email_people(p_since timestamptz, p_exclude text[], p_user uuid default null)
returns table (
  user_id      uuid,
  email        text,
  first_name   text,
  confirmed_at timestamptz,
  job_id       uuid,
  job_title    text,
  job_company  text,
  practised    boolean,
  paid         boolean,
  sent         text[]
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
    au.email_confirmed_at,
    j.id, j.title, j.company,
    exists (select 1 from practice_sessions ps where ps.user_id = au.id),
    (exists (select 1 from passes p where p.user_id = au.id)
      or exists (select 1 from user_access_passes a where a.user_id = au.id)
      or exists (select 1 from entitlements e where e.user_id = au.id and e.status = 'active'
                   and (e.expires_at is null or e.expires_at > now()))),
    coalesce((select array_agg(s.kind order by s.kind) from email_sends s where s.user_id = au.id), '{}'::text[])
  from auth.users au
  left join lateral (
    select jb.id, jb.title, jb.company from jobs jb
    where jb.user_id = au.id order by jb.created_at desc limit 1
  ) j on true
  where au.email is not null
    and au.email_confirmed_at is not null
    and au.email_confirmed_at >= p_since
    and (p_user is null or au.id = p_user)
    and lower(au.email::text) <> all (coalesce(p_exclude, '{}'::text[]))
    and not exists (select 1 from email_unsubscribes u where u.user_id = au.id)
  order by au.email_confirmed_at
  limit 5000;
$$;

revoke all on function public.email_people(timestamptz, text[], uuid) from public, anon, authenticated;
grant execute on function public.email_people(timestamptz, text[], uuid) to service_role;
