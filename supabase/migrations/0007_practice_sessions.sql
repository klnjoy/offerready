-- OfferReady — Phase 1.5 fix: create the practice_sessions table
-- =============================================================================
-- ROOT CAUSE this migration fixes:
--   0006_practice_job_link.sql ALTERs public.practice_sessions (add job_id,
--   session_id, indexes, RLS, the complete_practice() RPC) but uses
--   `alter table IF EXISTS ...`. No earlier migration (0001-0004) ever CREATES
--   practice_sessions, so on a database where that table was never provisioned
--   the 0006 ALTERs silently do nothing and every practice-completion write
--   (RPC and the two-step fallback) fails against a non-existent table. The
--   Defend completion screen then shows "the server couldn't save it right now"
--   and the dashboard stays at 0 practice sessions / 0 snapshots.
--
-- WHAT THIS DOES (ADDITIVE, IDEMPOTENT):
--   Creates public.practice_sessions with EXACTLY the columns the server writes
--   (api/_lib/readiness.js savePracticeSession + the complete_practice RPC):
--     id, user_id, job_id, session_id, content_slug, category, mode, score,
--     completed, completed_at
--   plus the retrieval index, the idempotency unique index, RLS policies, and
--   the authenticated grants that 0006 expects to exist.
--
--   Safe to run before OR after 0006: everything is guarded with IF NOT EXISTS /
--   IF EXISTS. If 0006 already created the columns on an existing table, this is
--   a no-op for those. If the table was missing, this creates it fully so the
--   0006 objects (and the complete_practice RPC) work.
--
--   After applying this, RE-RUN 0006_practice_job_link.sql once to (re)create
--   the FK, indexes, RLS, and the complete_practice() RPC against the now-present
--   table. (0006 is itself idempotent.)
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- practice_sessions — one row per completed practice/defend scenario, scoped
-- to a saved job. Writes go through the authenticated /api/jobs/:id endpoint
-- (service-role); user_id + job_id come from the verified JWT + ownership-
-- checked route. job_id/session_id are nullable to match 0006's model (legacy
-- rows had null job_id; session_id drives idempotency when present).
-- ---------------------------------------------------------------------------
create table if not exists public.practice_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  job_id         uuid references public.jobs(id) on delete cascade,
  session_id     text,                       -- idempotency key (client runId)
  content_slug   text,                       -- scenario slug practiced
  category       text,                       -- scenario family / category
  mode           text,                       -- 'scenario' | 'why_chain' | ...
  score          integer not null default 0, -- 0-100 self-rated defense score
  completed      boolean not null default true,
  completed_at   timestamptz not null default now()
);

-- Defensive: if the table already existed WITHOUT the Phase-1.5 columns (e.g.
-- an older bespoke definition), make sure every column the code uses is present.
alter table if exists public.practice_sessions add column if not exists job_id uuid;
alter table if exists public.practice_sessions add column if not exists session_id text;
alter table if exists public.practice_sessions add column if not exists content_slug text;
alter table if exists public.practice_sessions add column if not exists category text;
alter table if exists public.practice_sessions add column if not exists mode text;
alter table if exists public.practice_sessions add column if not exists score integer not null default 0;
alter table if exists public.practice_sessions add column if not exists completed boolean not null default true;
alter table if exists public.practice_sessions add column if not exists completed_at timestamptz not null default now();

-- FK to jobs with CASCADE (match the other job-child tables). Guarded so a
-- re-run (or 0006 having added it) doesn't error.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'practice_sessions_job_id_fkey'
  ) then
    alter table public.practice_sessions
      add constraint practice_sessions_job_id_fkey
      foreign key (job_id) references public.jobs(id) on delete cascade;
  end if;
end $$;

-- Retrieval + idempotency indexes (same as 0006; harmless if already present).
create index if not exists idx_practice_sessions_user_job_time
  on public.practice_sessions (user_id, job_id, completed_at desc);

create unique index if not exists uq_practice_sessions_idem
  on public.practice_sessions (user_id, job_id, session_id)
  where session_id is not null;

-- ---------------------------------------------------------------------------
-- RLS + grants (own rows; job-scoped rows require owning the job). Mirrors the
-- policies 0006 installs so this file alone fully secures the table.
-- ---------------------------------------------------------------------------
alter table public.practice_sessions enable row level security;
grant select, insert, update, delete on public.practice_sessions to authenticated;

drop policy if exists sessions_select_own on public.practice_sessions;
create policy sessions_select_own on public.practice_sessions
  for select to authenticated
  using (
    auth.uid() = user_id
    and (
      job_id is null
      or exists (select 1 from public.jobs j where j.id = job_id and j.user_id = auth.uid())
    )
  );

drop policy if exists sessions_insert_own on public.practice_sessions;
create policy sessions_insert_own on public.practice_sessions
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and (
      job_id is null
      or exists (select 1 from public.jobs j where j.id = job_id and j.user_id = auth.uid())
    )
  );

drop policy if exists sessions_update_own on public.practice_sessions;
create policy sessions_update_own on public.practice_sessions
  for update to authenticated
  using (
    auth.uid() = user_id
    and (
      job_id is null
      or exists (select 1 from public.jobs j where j.id = job_id and j.user_id = auth.uid())
    )
  )
  with check (
    auth.uid() = user_id
    and (
      job_id is null
      or exists (select 1 from public.jobs j where j.id = job_id and j.user_id = auth.uid())
    )
  );

drop policy if exists sessions_delete_own on public.practice_sessions;
create policy sessions_delete_own on public.practice_sessions
  for delete to authenticated
  using (auth.uid() = user_id);

-- =============================================================================
-- NEXT STEP after applying this file:
--   Re-run 0006_practice_job_link.sql once. It will now find the table and
--   (idempotently) ensure the FK, indexes, RLS, progress_metrics source/
--   dedupe_key columns, and the complete_practice() RPC are all in place.
-- =============================================================================

-- VERIFICATION (expected results in comments):
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_schema='public' and table_name='practice_sessions'
--  order by ordinal_position;
-- -- EXPECT: id, user_id, job_id, session_id, content_slug, category, mode,
-- --         score, completed, completed_at
--
-- select indexname from pg_indexes
--  where schemaname='public' and tablename='practice_sessions';
-- -- EXPECT: the primary key, idx_practice_sessions_user_job_time,
-- --         uq_practice_sessions_idem
