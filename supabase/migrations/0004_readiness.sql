-- OfferReady SaaS — Interview Readiness Platform (Phase 1)
-- =============================================================================
-- Evolves OfferReady from "JD -> questions" into a job-rooted readiness system.
-- Everything hangs off public.jobs (created in 0003_jobs.sql), so a user can
-- prepare for several target jobs at once, each with its own gap analysis,
-- generated questions, and progress.
--
--   users (auth.users)
--     └── jobs
--           ├── gap_analysis        (resume vs JD match, per job)
--           ├── questions           (JD-generated interview questions, per job)
--           ├── progress_metrics    (readiness snapshots over time, per job)
--           ├── preparation_plans   (Phase 2 — table created empty now)
--           ├── answers             (Phase 2 — table created empty now)
--           └── assessments         (Phase 2 — table created empty now)
--     └── resumes                   (analysis-only; NO raw resume text at rest)
--
-- Security (mirrors 0002_rls.sql / 0003_jobs.sql):
--   * RLS everywhere: a user reads/writes ONLY their own rows (auth.uid() = user_id).
--   * Writes are normally performed server-side (service_role) after the API
--     verifies the user's JWT; authenticated CRUD on own rows is also granted
--     for defense-in-depth / direct client reads.
--   * PRIVACY: raw resume text is NOT stored. The resumes table keeps only the
--     distilled analysis (skills/keywords/signals) + file metadata. Same posture
--     the JD analyzer uses (no raw JD/resume at rest unless the user opts in).
--
-- Idempotent: safe to re-run.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- resumes — distilled resume signals only (NO raw resume text).
-- Parsed client-side (PDF/DOCX -> text -> analysis); we persist the analysis.
-- ---------------------------------------------------------------------------
create table if not exists public.resumes (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  label              text,                       -- e.g. "Resume - Oct 2026"
  file_name          text,                       -- original filename (metadata only)
  file_type          text,                       -- 'pdf' | 'docx' | 'txt'
  -- Distilled signals extracted from the resume (skills, keywords, seniority,
  -- experience signals). NEVER the raw resume text.
  extracted          jsonb not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_resumes_user on public.resumes(user_id);

-- ---------------------------------------------------------------------------
-- gap_analysis — one resume-vs-JD comparison per row, rooted on a job.
-- ---------------------------------------------------------------------------
create table if not exists public.gap_analysis (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  job_id             uuid not null references public.jobs(id) on delete cascade,
  resume_id          uuid references public.resumes(id) on delete set null,
  -- 0-100 overall resume<->JD match.
  match_score        integer not null default 0,
  -- Readiness sub-scores (0-100) surfaced on the dashboard.
  technical_score    integer not null default 0,
  behavioral_score   integer not null default 0,
  architecture_score integer not null default 0,
  domain_score       integer not null default 0,
  -- Structured result: { strengths[], missingSkills[], missingKeywords[],
  -- missingExperience[], notes }. PROTECTED by RLS.
  result             jsonb not null default '{}',
  model              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_gap_user on public.gap_analysis(user_id);
create index if not exists idx_gap_job on public.gap_analysis(job_id);

-- ---------------------------------------------------------------------------
-- questions — JD-generated interview questions, rooted on a job.
-- One row per question so answers/assessments (Phase 2) can reference them.
-- ---------------------------------------------------------------------------
create table if not exists public.questions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  job_id             uuid not null references public.jobs(id) on delete cascade,
  -- 'technical' | 'behavioral' | 'system_design' | 'leadership' | 'recruiter' | 'hiring_manager'
  category           text not null,
  -- 'easy' | 'medium' | 'hard'
  difficulty         text not null default 'medium',
  prompt             text not null,
  -- Optional model answer / signals for later evaluation (Phase 2).
  model_answer       text,
  signals            jsonb not null default '[]',
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now()
);
create index if not exists idx_questions_user on public.questions(user_id);
create index if not exists idx_questions_job on public.questions(job_id);
create index if not exists idx_questions_job_cat on public.questions(job_id, category);

-- ---------------------------------------------------------------------------
-- progress_metrics — readiness snapshots over time, rooted on a job.
-- One row per recorded snapshot so the dashboard can chart a readiness trend.
-- ---------------------------------------------------------------------------
create table if not exists public.progress_metrics (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  job_id             uuid not null references public.jobs(id) on delete cascade,
  overall_readiness  integer not null default 0,   -- 0-100 weighted score
  technical_score    integer not null default 0,
  behavioral_score   integer not null default 0,
  architecture_score integer not null default 0,
  domain_score       integer not null default 0,
  questions_practiced integer not null default 0,
  avg_answer_score   integer not null default 0,
  -- Free-form extras: weakest/strongest topic, counts, etc.
  detail             jsonb not null default '{}',
  recorded_at        timestamptz not null default now()
);
create index if not exists idx_progress_user on public.progress_metrics(user_id);
create index if not exists idx_progress_job on public.progress_metrics(job_id);
create index if not exists idx_progress_job_time on public.progress_metrics(job_id, recorded_at desc);

-- ---------------------------------------------------------------------------
-- Phase 2 placeholders — created empty now so the schema is stable and the FKs
-- are ready when we wire the features (editable plans, answers, assessments).
-- ---------------------------------------------------------------------------
create table if not exists public.preparation_plans (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  job_id             uuid not null references public.jobs(id) on delete cascade,
  -- Array of { day, title, detail, done } steps (editable by the user).
  steps              jsonb not null default '[]',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_plans_user on public.preparation_plans(user_id);
create index if not exists idx_plans_job on public.preparation_plans(job_id);

create table if not exists public.answers (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  job_id             uuid not null references public.jobs(id) on delete cascade,
  question_id        uuid references public.questions(id) on delete cascade,
  answer_text        text,
  created_at         timestamptz not null default now()
);
create index if not exists idx_answers_user on public.answers(user_id);
create index if not exists idx_answers_question on public.answers(question_id);

create table if not exists public.assessments (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  job_id             uuid not null references public.jobs(id) on delete cascade,
  answer_id          uuid references public.answers(id) on delete cascade,
  score              integer not null default 0,   -- 0-100
  result             jsonb not null default '{}',   -- strengths/weaknesses/suggestions
  model              text,
  created_at         timestamptz not null default now()
);
create index if not exists idx_assessments_user on public.assessments(user_id);
create index if not exists idx_assessments_answer on public.assessments(answer_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers (reuse public.set_updated_at from 0001_schema.sql).
-- ---------------------------------------------------------------------------
drop trigger if exists trg_resumes_updated on public.resumes;
create trigger trg_resumes_updated
  before update on public.resumes
  for each row execute function public.set_updated_at();

drop trigger if exists trg_gap_updated on public.gap_analysis;
create trigger trg_gap_updated
  before update on public.gap_analysis
  for each row execute function public.set_updated_at();

drop trigger if exists trg_plans_updated on public.preparation_plans;
create trigger trg_plans_updated
  before update on public.preparation_plans
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS + grants for every table (own rows only).
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'resumes', 'gap_analysis', 'questions', 'progress_metrics',
    'preparation_plans', 'answers', 'assessments'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);

    execute format('drop policy if exists %I on public.%I;', t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (auth.uid() = user_id);',
      t || '_select_own', t);

    execute format('drop policy if exists %I on public.%I;', t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (auth.uid() = user_id);',
      t || '_insert_own', t);

    execute format('drop policy if exists %I on public.%I;', t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);',
      t || '_update_own', t);

    execute format('drop policy if exists %I on public.%I;', t || '_delete_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (auth.uid() = user_id);',
      t || '_delete_own', t);
  end loop;
end $$;
