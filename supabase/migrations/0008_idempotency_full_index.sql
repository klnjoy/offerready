-- OfferReady — Phase 1.5 fix: make the practice/snapshot idempotency indexes
-- NON-PARTIAL so PostgREST upserts (on_conflict) actually work.
-- =============================================================================
-- ROOT CAUSE this migration fixes:
--   0006/0007 created the idempotency indexes as PARTIAL unique indexes:
--       uq_practice_sessions_idem (user_id, job_id, session_id) WHERE session_id IS NOT NULL
--       uq_progress_metrics_dedupe (user_id, job_id, dedupe_key) WHERE dedupe_key IS NOT NULL
--   The server's two-step fallback write (api/_lib/readiness.js
--   savePracticeSession / saveProgressSnapshot) upserts via PostgREST:
--       POST /practice_sessions?on_conflict=user_id,job_id,session_id
--       Prefer: resolution=merge-duplicates
--   PostgREST / Postgres cannot infer an ON CONFLICT arbiter from a PARTIAL
--   unique index (the WHERE predicate can't be expressed in the REST call), so
--   the INSERT is rejected -> "FAILED session insert" even though the table and
--   columns exist (schemaReady:true). The Defend completion then shows "the
--   server couldn't save it right now" and nothing reaches the dashboard.
--
-- WHY A FULL INDEX IS SAFE HERE:
--   In Postgres, NULLs are DISTINCT under a unique index, so a plain
--   UNIQUE (user_id, job_id, session_id) still allows many rows with
--   session_id IS NULL (legacy rows) to coexist — exactly what the partial
--   predicate was protecting. We lose nothing and gain a REST-upsertable
--   conflict target. (Default NULLS DISTINCT; we do NOT use NULLS NOT DISTINCT.)
--
-- ADDITIVE / IDEMPOTENT: drops only the two partial indexes and recreates them
-- as full unique indexes. Safe to re-run.
-- =============================================================================

-- 1) practice_sessions idempotency: partial -> full unique index.
drop index if exists public.uq_practice_sessions_idem;
create unique index if not exists uq_practice_sessions_idem
  on public.practice_sessions (user_id, job_id, session_id);

-- 2) progress_metrics dedupe: partial -> full unique index.
drop index if exists public.uq_progress_metrics_dedupe;
create unique index if not exists uq_progress_metrics_dedupe
  on public.progress_metrics (user_id, job_id, dedupe_key);

-- 3) Re-create the complete_practice RPC so its ON CONFLICT clauses target the
--    now-FULL indexes (drop the "where ... is not null" predicate). The body is
--    otherwise identical to 0006. Function bodies are atomic, so session +
--    snapshot still commit together.
create or replace function public.complete_practice(
  p_user_id      uuid,
  p_job_id       uuid,
  p_session_id   text,
  p_category     text,
  p_mode         text,
  p_content_slug text,
  p_score        integer,
  p_completed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session        public.practice_sessions;
  v_snapshot       public.progress_metrics;
  v_gap            public.gap_analysis;
  v_match          integer := 0;
  v_count          integer := 0;
  v_avg            integer := 0;
  v_completion     integer := 0;
  v_overall        integer := 0;
  v_dedupe         text;
  v_score          integer := greatest(0, least(100, coalesce(p_score, 0)));
  v_completed_at   timestamptz := coalesce(p_completed_at, now());
begin
  if not exists (select 1 from public.jobs j where j.id = p_job_id and j.user_id = p_user_id) then
    raise exception 'job % not owned by user %', p_job_id, p_user_id
      using errcode = '42501';
  end if;

  insert into public.practice_sessions
    (user_id, job_id, session_id, content_slug, category, mode, score, completed, completed_at)
  values
    (p_user_id, p_job_id, p_session_id, p_content_slug, p_category, p_mode, v_score, true, v_completed_at)
  on conflict (user_id, job_id, session_id)
  do update set
    score = excluded.score,
    category = excluded.category,
    mode = excluded.mode,
    content_slug = excluded.content_slug,
    completed = true,
    completed_at = excluded.completed_at
  returning * into v_session;

  select * into v_gap
    from public.gap_analysis
   where user_id = p_user_id and job_id = p_job_id
   order by created_at desc limit 1;
  v_match := coalesce(v_gap.match_score, 0);

  select count(*)::int,
         coalesce(round(avg(score))::int, 0)
    into v_count, v_avg
    from public.practice_sessions
   where user_id = p_user_id and job_id = p_job_id
     and completed is true and score is not null;

  v_completion := least(v_count, 10) * 10;
  if v_gap.id is null and v_avg = 0 then
    v_overall := 0;
  else
    v_overall := greatest(0, least(100,
      round(0.5 * v_match + 0.3 * v_avg + 0.2 * v_completion)::int));
  end if;

  v_dedupe := 'practice:' || p_session_id;
  insert into public.progress_metrics
    (user_id, job_id, overall_readiness, technical_score, behavioral_score,
     architecture_score, domain_score, questions_practiced, avg_answer_score,
     detail, source, dedupe_key)
  values
    (p_user_id, p_job_id, v_overall,
     greatest(0, least(100, round(coalesce(case when v_avg > 0 then 0.7 * coalesce(v_gap.technical_score,0)    + 0.3 * v_avg else v_gap.technical_score    end, 0))::int)),
     greatest(0, least(100, round(coalesce(case when v_avg > 0 then 0.7 * coalesce(v_gap.behavioral_score,0)   + 0.3 * v_avg else v_gap.behavioral_score   end, 0))::int)),
     greatest(0, least(100, round(coalesce(case when v_avg > 0 then 0.7 * coalesce(v_gap.architecture_score,0) + 0.3 * v_avg else v_gap.architecture_score end, 0))::int)),
     greatest(0, least(100, round(coalesce(case when v_avg > 0 then 0.7 * coalesce(v_gap.domain_score,0)       + 0.3 * v_avg else v_gap.domain_score       end, 0))::int)),
     v_count, v_avg,
     jsonb_build_object('match_score', v_match, 'practice_count', v_count),
     'practice_session_completed', v_dedupe)
  on conflict (user_id, job_id, dedupe_key)
  do update set
    overall_readiness = excluded.overall_readiness,
    technical_score = excluded.technical_score,
    behavioral_score = excluded.behavioral_score,
    architecture_score = excluded.architecture_score,
    domain_score = excluded.domain_score,
    questions_practiced = excluded.questions_practiced,
    avg_answer_score = excluded.avg_answer_score,
    detail = excluded.detail,
    recorded_at = now()
  returning * into v_snapshot;

  return jsonb_build_object(
    'session', to_jsonb(v_session),
    'snapshot', to_jsonb(v_snapshot),
    'readiness', jsonb_build_object(
      'overall', v_overall,
      'questionsPracticed', v_count,
      'avgAnswerScore', v_avg
    )
  );
end;
$$;

revoke all on function public.complete_practice(uuid, uuid, text, text, text, text, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.complete_practice(uuid, uuid, text, text, text, text, integer, timestamptz) to service_role;

-- =============================================================================
-- VERIFICATION:
-- select indexdef from pg_indexes
--  where schemaname='public' and indexname in
--    ('uq_practice_sessions_idem','uq_progress_metrics_dedupe');
-- -- EXPECT: neither indexdef contains a "WHERE" clause anymore.
-- =============================================================================
