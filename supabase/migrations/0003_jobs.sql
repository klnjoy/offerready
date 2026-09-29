-- OfferReady SaaS — Saved Jobs (Phase 5: job-centered product)
-- =============================================================================
-- Persists each analyzed job per user so the product is organized around the
-- user's real target jobs (spec §5 "My Jobs", §25 data model). One row per
-- saved analysis. The full structured analysis is stored as JSONB; a few
-- columns are denormalized for a fast dashboard list.
--
-- Security:
--   * RLS: a user reads/writes ONLY their own jobs (auth.uid() = user_id).
--   * Writes are normally performed server-side (service_role) by the jobs API
--     after verifying the user's JWT, mirroring the premium endpoints. We also
--     grant the authenticated role CRUD on own rows for defense-in-depth /
--     direct client reads.
--   * Resumes/JDs are sensitive: job_description and resume text are OPTIONAL
--     to store. The API stores the JD only if the user chose to save the job;
--     resume text is NOT persisted by default.
--
-- Idempotent: safe to re-run.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- jobs — one saved job analysis per row.
-- ---------------------------------------------------------------------------
create table if not exists public.jobs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  title              text not null default 'Untitled role',
  company            text,
  seniority          text,
  -- Denormalized counters for the dashboard list (kept in sync on save).
  skills_count       integer not null default 0,
  gaps_count         integer not null default 0,
  -- The full analyze-job response object (roleSummary, coreSkills, readiness,
  -- potentialGaps, preparationPlan, offerReadyResources, ...). PROTECTED by RLS.
  analysis           jsonb not null default '{}',
  -- Optional raw job description (only if the user saves it). NULL by default.
  job_description    text,
  model              text,
  -- Preparation progress for this job (0-100), driven by practice/defend reps.
  prep_progress      integer not null default 0,
  last_activity_at   timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_jobs_user on public.jobs(user_id);
create index if not exists idx_jobs_user_created on public.jobs(user_id, created_at desc);

drop trigger if exists trg_jobs_updated on public.jobs;
create trigger trg_jobs_updated
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS + grants (mirror 0002_rls.sql conventions).
-- ---------------------------------------------------------------------------
alter table public.jobs enable row level security;

grant select, insert, update, delete on public.jobs to authenticated;

drop policy if exists jobs_select_own on public.jobs;
create policy jobs_select_own on public.jobs
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists jobs_insert_own on public.jobs;
create policy jobs_insert_own on public.jobs
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists jobs_update_own on public.jobs;
create policy jobs_update_own on public.jobs
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists jobs_delete_own on public.jobs;
create policy jobs_delete_own on public.jobs
  for delete to authenticated
  using (auth.uid() = user_id);
