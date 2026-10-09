-- OfferReady SaaS — shared interview reports and prep outcomes
-- =============================================================================
-- Two opt-in tables that build OfferReady's own data over time:
--
-- interview_reports  When a user ticks "Share these questions anonymously" on a
--                    debrief, the app saves the company, role family, level,
--                    round type, month, the questions asked (+ how they went)
--                    and the round outcome. Never shared: interviewer names,
--                    the user's notes, exact dates, or who the user is.
-- prep_outcomes      The "How did it go?" check-in after an interview date:
--                    the result plus readiness and practice at that time, so
--                    readiness can be checked against real results.
--
-- Access model:
--   * A signed-in user can insert, read, update and delete ONLY their own rows
--     (to edit, un-share, or delete their data). Nobody else can read them
--     through the API; anon has no access.
--   * Aggregates for other users are built server-side (service role) and only
--     ever from groups of at least 3 different people (see the query below).
--   * Deleting an account deletes these rows (on delete cascade).
--
-- Example aggregate (SQL Editor; never expose groups smaller than 3 people):
--   select company, role_family, round, count(*) reports,
--          count(distinct user_id) people
--   from public.interview_reports
--   where interview_month >= to_char(now() - interval '6 months', 'YYYY-MM')
--   group by 1, 2, 3 having count(distinct user_id) >= 3
--   order by reports desc;
--
-- Readiness vs results:
--   select width_bucket(readiness, 0, 100, 5) as bucket, count(*),
--          avg((outcome in ('offer','next'))::int) as pass_rate
--   from public.prep_outcomes where outcome in ('offer','next','rejected')
--   group by 1 order by 1;
--
-- Idempotent: safe to re-run.
-- =============================================================================

create table if not exists public.interview_reports (
  id               bigint generated always as identity primary key,
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  debrief_id       text not null,
  company          text not null,          -- normalized (lowercase, trimmed) for grouping
  company_display  text,
  role_family      text,
  level            text,
  round            text not null,
  interview_month  text not null,          -- 'YYYY-MM', never the exact day
  questions        jsonb not null default '[]'::jsonb,  -- [{ "text": str, "rating": "good"|"ok"|"bad"|"" }]
  outcome          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, debrief_id)
);

alter table public.interview_reports drop constraint if exists interview_reports_fields_chk;
alter table public.interview_reports
  add constraint interview_reports_fields_chk check (
        char_length(debrief_id) between 1 and 64
    and char_length(company) between 2 and 80
    and (company_display is null or char_length(company_display) <= 80)
    and (role_family is null or char_length(role_family) <= 40)
    and (level is null or char_length(level) <= 30)
    and round in ('recruiter','technical','system_design','behavioral','onsite','hiring_manager')
    and interview_month ~ '^\d{4}-(0[1-9]|1[0-2])$'
    and jsonb_typeof(questions) = 'array'
    and jsonb_array_length(questions) <= 25
    and octet_length(questions::text) <= 10000
    and (outcome is null or outcome in ('waiting','next','offer','rejected'))
  );

create index if not exists interview_reports_company_idx on public.interview_reports (company, interview_month desc);

alter table public.interview_reports enable row level security;
revoke all on public.interview_reports from anon, authenticated;
grant select, insert, update, delete on public.interview_reports to authenticated;

drop policy if exists interview_reports_own on public.interview_reports;
create policy interview_reports_own on public.interview_reports
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------

create table if not exists public.prep_outcomes (
  id               bigint generated always as identity primary key,
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id           text not null,
  role_family      text,
  level            text,
  interview_date   date,
  outcome          text not null,
  readiness        smallint,
  practice_count   integer,
  days_prepared    integer,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, job_id)
);

alter table public.prep_outcomes drop constraint if exists prep_outcomes_fields_chk;
alter table public.prep_outcomes
  add constraint prep_outcomes_fields_chk check (
        char_length(job_id) between 1 and 128
    and (role_family is null or char_length(role_family) <= 40)
    and (level is null or char_length(level) <= 30)
    and outcome in ('offer','next','rejected','waiting','cancelled')
    and (readiness is null or readiness between 0 and 100)
    and (practice_count is null or practice_count between 0 and 100000)
    and (days_prepared is null or days_prepared between 0 and 3650)
  );

alter table public.prep_outcomes enable row level security;
revoke all on public.prep_outcomes from anon, authenticated;
grant select, insert, update, delete on public.prep_outcomes to authenticated;

drop policy if exists prep_outcomes_own on public.prep_outcomes;
create policy prep_outcomes_own on public.prep_outcomes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Keep updated_at honest on edits (set_updated_at() is from 0001_schema.sql).

drop trigger if exists interview_reports_touch on public.interview_reports;
create trigger interview_reports_touch before update on public.interview_reports
  for each row execute function public.set_updated_at();

drop trigger if exists prep_outcomes_touch on public.prep_outcomes;
create trigger prep_outcomes_touch before update on public.prep_outcomes
  for each row execute function public.set_updated_at();
