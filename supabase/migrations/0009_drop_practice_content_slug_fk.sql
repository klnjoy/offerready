-- OfferReady — Phase 1.5 fix: drop the stray practice_sessions.content_slug FK.
-- =============================================================================
-- ROOT CAUSE this migration fixes:
--   The live practice_sessions table carries a foreign key
--     practice_sessions_content_slug_fkey: content_slug -> premium_content(...)
--   that no migration in this repo defines (the table predates 0007 in the live
--   DB). Every practice completion writes content_slug = the practiced scenario
--   slug (a catalog slug like 'ai-engineer', a generated id like
--   'generated:ai-engineer:...', or a why-chain slug). Those are NOT rows in
--   premium_content, so the INSERT is rejected with:
--     23503 insert or update on table "practice_sessions" violates foreign key
--     constraint "practice_sessions_content_slug_fkey"
--   => the Defend completion fails to persist ("the server couldn't save it
--   right now") even though the table, columns, and indexes are all correct.
--
-- WHY DROPPING IT IS CORRECT:
--   content_slug on a practice session is a free-text LABEL of what was
--   practiced for display/analytics. It is intentionally not limited to premium
--   catalog content — free scenarios, generated exact-job scenarios, and
--   why-chains all record a slug. Constraining it to premium_content is wrong
--   and blocks all practice writes. We drop the FK; the column stays as plain
--   text (matching 0007's definition and what the app writes).
--
-- ADDITIVE / IDEMPOTENT: only drops the constraint if present. Safe to re-run.
-- =============================================================================

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'practice_sessions_content_slug_fkey'
      and conrelid = 'public.practice_sessions'::regclass
  ) then
    alter table public.practice_sessions
      drop constraint practice_sessions_content_slug_fkey;
  end if;
end $$;

-- Defensive: some generators name the constraint differently. Drop any FK on
-- practice_sessions whose referenced table is premium_content, regardless of
-- its name, so this fix is robust to naming variance.
do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.practice_sessions'::regclass
      and con.contype = 'f'
      and con.confrelid = 'public.premium_content'::regclass
  loop
    execute format('alter table public.practice_sessions drop constraint %I', r.conname);
  end loop;
exception
  when undefined_table then
    -- premium_content doesn't exist in this DB; nothing to do.
    null;
end $$;

-- =============================================================================
-- VERIFICATION:
-- select conname, confrelid::regclass as references
-- from pg_constraint
-- where conrelid = 'public.practice_sessions'::regclass and contype = 'f';
-- -- EXPECT: only practice_sessions_job_id_fkey -> jobs
-- --         (NO constraint referencing premium_content)
-- =============================================================================
