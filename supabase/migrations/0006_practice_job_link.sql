-- OfferReady — Phase 1.5: link practice to jobs + make snapshots idempotent
-- =============================================================================
-- ADDITIVE ONLY. This migration connects practice activity to the job-rooted
-- readiness system so a completed practice session contributes to a job's
-- Interview Readiness. It adds columns, an index, and tightened RLS. It does
-- NOT drop anything and is independent of 0005_cleanup.sql.
--
-- IMPORTANT: Do NOT run 0005_cleanup.sql as part of this batch. This file does
-- not depend on it and must be applied on its own.
--
-- What changes and why
--   practice_sessions:
--     + job_id uuid  -> which saved job this practice belongs to (nullable so
--                       legacy rows survive; new Phase-1.5 writes always set it)
--     + session_id text -> client/server idempotency key so a double-click,
--                       retry, or refresh after submit does NOT create a second
--                       session or a second snapshot
--   progress_metrics:
--     + source text      -> the event that produced the snapshot
--                           ('gap_analysis_completed' | 'practice_session_completed')
--     + dedupe_key text  -> idempotency key for the snapshot (e.g. the practice
--                           session_id, or a gap-analysis hash) so retries don't
--                           append duplicate trend points
--
-- Legacy data: existing practice_sessions rows keep job_id = NULL. We do NOT
-- invent a job_id for them (they are not reliably attributable). Job-scoped
-- readiness reads must EXCLUDE null-job rows (the application does this).
--
-- Delete behavior: job_id uses ON DELETE CASCADE, matching the existing
-- job-child ownership model (gap_analysis / questions / progress_metrics all
-- cascade from jobs). Deleting a saved job removes its practice history and
-- readiness snapshots, which is the intended product behavior.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / IF EXISTS everywhere).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) practice_sessions: add job_id (nullable) + FK + session_id (idempotency)
-- ---------------------------------------------------------------------------
alter table if exists public.practice_sessions
  add column if not exists job_id uuid;

alter table if exists public.practice_sessions
  add column if not exists session_id text;

-- FK to jobs with CASCADE (match the other job-child tables). Guard so re-runs
-- don't error on an existing constraint.
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

-- ---------------------------------------------------------------------------
-- 2) Retrieval index: recent practice for a (user, job), newest first.
-- ---------------------------------------------------------------------------
create index if not exists idx_practice_sessions_user_job_time
  on public.practice_sessions (user_id, job_id, completed_at desc);

-- ---------------------------------------------------------------------------
-- 3) Idempotency for practice sessions:
--    (user_id, job_id, session_id) is logically unique when session_id is set.
--    Partial unique index so legacy rows (null session_id) are unaffected and
--    an upsert can target this conflict key.
-- ---------------------------------------------------------------------------
create unique index if not exists uq_practice_sessions_idem
  on public.practice_sessions (user_id, job_id, session_id)
  where session_id is not null;

-- ---------------------------------------------------------------------------
-- 4) progress_metrics: add source + dedupe_key, and dedupe snapshots.
-- ---------------------------------------------------------------------------
alter table if exists public.progress_metrics
  add column if not exists source text;

alter table if exists public.progress_metrics
  add column if not exists dedupe_key text;

create unique index if not exists uq_progress_metrics_dedupe
  on public.progress_metrics (user_id, job_id, dedupe_key)
  where dedupe_key is not null;

-- ---------------------------------------------------------------------------
-- 5) RLS: a user may access a practice session only when it is THEIRS *and*
--    (when job-scoped) the referenced job is also theirs. Legacy null-job rows
--    remain accessible to their owner (job_id is null => the job clause is
--    skipped), but they are excluded from job-specific reads by the app.
--
--    We also add a DELETE policy + grant (previously practice_sessions had no
--    delete), so job CASCADE deletes and user-initiated cleanup behave.
-- ---------------------------------------------------------------------------
grant delete on public.practice_sessions to authenticated;

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

-- NOTE: Phase 1.5 writes go through the authenticated server endpoint
-- /api/jobs/:id (service-role, which bypasses RLS) and ALWAYS set user_id +
-- job_id from the verified JWT and the ownership-checked route. These RLS
-- policies are defense-in-depth for any direct client access.

-- =============================================================================
-- VERIFICATION (run after applying; expected results in comments)
-- =============================================================================
-- -- a) Confirm the new columns exist:
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'practice_sessions'
--   and column_name in ('job_id','session_id');
-- -- EXPECT: job_id | uuid | YES   and   session_id | text | YES
--
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'progress_metrics'
--   and column_name in ('source','dedupe_key');
-- -- EXPECT: source | text   and   dedupe_key | text
--
-- -- b) Confirm the foreign key:
-- select conname, confrelid::regclass as references
-- from pg_constraint where conname = 'practice_sessions_job_id_fkey';
-- -- EXPECT: practice_sessions_job_id_fkey | jobs
--
-- -- c) Confirm the indexes:
-- select indexname from pg_indexes
-- where schemaname = 'public' and tablename = 'practice_sessions'
--   and indexname in ('idx_practice_sessions_user_job_time','uq_practice_sessions_idem');
-- -- EXPECT: both rows present
-- select indexname from pg_indexes
-- where schemaname = 'public' and tablename = 'progress_metrics'
--   and indexname = 'uq_progress_metrics_dedupe';
-- -- EXPECT: one row
--
-- -- d) Confirm the policies:
-- select policyname, cmd from pg_policies
-- where schemaname = 'public' and tablename = 'practice_sessions'
-- order by policyname;
-- -- EXPECT: sessions_delete_own | DELETE, sessions_insert_own | INSERT,
-- --         sessions_select_own | SELECT, sessions_update_own | UPDATE
--
-- -- e) Count legacy rows that will NOT contribute to job readiness:
-- select count(*) as legacy_null_job_sessions
-- from public.practice_sessions where job_id is null;
-- -- EXPECT: however many pre-1.5 sessions exist (these are excluded from
-- --         job-scoped readiness by design).

-- =============================================================================
-- ROLLBACK GUIDANCE (manual; only if you need to fully reverse this migration)
-- =============================================================================
-- -- Dropping the columns removes any Phase-1.5 practice->job links + snapshot
-- -- idempotency keys. Do this only if you are reverting the app too.
-- drop index if exists public.uq_progress_metrics_dedupe;
-- drop index if exists public.uq_practice_sessions_idem;
-- drop index if exists public.idx_practice_sessions_user_job_time;
--
-- alter table if exists public.progress_metrics  drop column if exists dedupe_key;
-- alter table if exists public.progress_metrics  drop column if exists source;
--
-- alter table if exists public.practice_sessions drop constraint if exists practice_sessions_job_id_fkey;
-- alter table if exists public.practice_sessions drop column if exists session_id;
-- alter table if exists public.practice_sessions drop column if exists job_id;
--
-- -- Restore the original (user-only) RLS policies from 0002_rls.sql if needed,
-- -- and REVOKE delete on public.practice_sessions from authenticated.
