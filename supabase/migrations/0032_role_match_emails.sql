-- New-role match emails (opt-in only).
--
-- email_roles_optin: one row per person who turned on "Email me new roles that
-- match my resume" (Account or Open roles). cc = the country to watch ('' =
-- every country), taken from Open roles' country filter when they turned it on.
--
-- role_match_people() returns who may get today's digest: opted in, confirmed
-- email, not unsubscribed, with their synced resume text (only people who
-- turned on resume sync have one on the server; the app says so) and the
-- 'roles:' sends of the last 30 days. The API matches them against the public
-- roles feed (lib/roleEmails.js). Sends are recorded in email_sends (0027) as
-- kind 'roles:YYYY-MM-DD'.

create table if not exists public.email_roles_optin (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  cc         text not null default '' check (cc ~ '^([A-Z]{2})?$'),
  created_at timestamptz not null default now()
);
alter table public.email_roles_optin enable row level security;
revoke all on table public.email_roles_optin from public, anon, authenticated;

create or replace function public.role_match_people(p_exclude text[], p_user uuid default null)
returns table (
  user_id     uuid,
  email       text,
  first_name  text,
  cc          text,
  optin_at    timestamptz,
  resume      text,
  last_sent   timestamptz,
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
    o.cc,
    o.created_at,
    (select left(coalesce(us.value->>'text', ''), 40000) from user_state us where us.user_id = au.id and us.key = 'offerready.resume.v1'),
    (select max(s.sent_at) from email_sends s where s.user_id = au.id and s.kind like 'roles:%'),
    coalesce((select array_agg(s.kind order by s.kind) from email_sends s
              where s.user_id = au.id and s.kind like 'roles:%' and s.sent_at > now() - interval '30 days'), '{}'::text[])
  from email_roles_optin o
  join auth.users au on au.id = o.user_id
  where au.email is not null
    and au.email_confirmed_at is not null
    and (p_user is null or au.id = p_user)
    and lower(au.email::text) <> all (coalesce(p_exclude, '{}'::text[]))
    and not exists (select 1 from email_unsubscribes u where u.user_id = au.id)
  limit 5000;
$$;

revoke all on function public.role_match_people(text[], uuid) from public, anon, authenticated;
grant execute on function public.role_match_people(text[], uuid) to service_role;
