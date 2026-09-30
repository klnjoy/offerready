-- OfferReady — Consolidation Batch 1: schema cleanup (drop zombie tables)
-- =============================================================================
-- Removes tables that NO code path writes and nothing meaningfully reads, so
-- the schema reflects only what the MVP actually uses. Verified against the
-- codebase before dropping:
--
--   KEPT (actively used):
--     jobs, gap_analysis, questions           -- job-rooted core (server writes)
--     progress_metrics                         -- readiness engine READS it; the
--                                                 writer lands in Batch 2. Keep.
--     practice_sessions                        -- scenario.js client-direct write
--     profiles, subscriptions, entitlements,
--     features, premium_content, webhook_events -- auth/billing/content
--
--   DROPPED (zombie: no writer anywhere, and either unread or Phase-2 stubs):
--     user_progress        -- unused; duplicated by progress_metrics
--     assessments          -- Phase-2 stub, empty, no writer
--     answers              -- Phase-2 stub, empty, no writer
--     preparation_plans    -- Phase-2 stub, empty, no writer
--     resumes              -- empty, no writer (resume text is parsed client-side
--                             and intentionally never persisted)
--
-- DEPENDENCY MAP (FKs among the dropped set, so order/cascade is safe):
--     assessments.answer_id  -> answers.id
--     answers.question_id    -> questions.id       (questions KEPT)
--     gap_analysis.resume_id -> resumes.id         (gap_analysis KEPT)
--   Handling:
--     * Drop assessments before answers (assessments depends on answers).
--     * Before dropping resumes, drop the gap_analysis.resume_id column so the
--       KEPT gap_analysis table has no dangling FK. (No data loss: resume_id was
--       never populated.)
--     * user_progress and preparation_plans have no inbound FKs from kept tables.
--
-- Idempotent: safe to re-run (IF EXISTS everywhere).
-- =============================================================================

-- 1) Remove the dangling FK column on a KEPT table before dropping its target.
alter table if exists public.gap_analysis drop column if exists resume_id;

-- 2) Drop the zombie tables. CASCADE cleans their own policies/indexes/constraints.
--    Order respects the assessments -> answers dependency; CASCADE covers the rest.
drop table if exists public.assessments cascade;
drop table if exists public.answers cascade;
drop table if exists public.preparation_plans cascade;
drop table if exists public.resumes cascade;
drop table if exists public.user_progress cascade;
