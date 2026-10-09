-- OfferReady SaaS — meter resume tailoring ('resume_tailor')
-- =============================================================================
-- POST /api/premium/tailor records one usage_events row per successful run as
-- feature 'resume_tailor' (Free 2 / Pro 100 a month, api/_lib/plans.js).
-- Migration 0010 created usage_events with a CHECK constraint
-- (usage_events_feature_chk) that only allows the original five features, so
-- this widens it.
--
-- FAIL-SAFE until this runs: the insert is rejected by the old constraint,
-- recordUse() logs once and ignores it, and the tailoring response is sent
-- anyway. The only effect is that tailoring runs are not counted (so Free
-- isn't limited) until the migration is applied.
--
-- Idempotent: safe to re-run. Keeps every feature 0010 allowed.
-- =============================================================================

alter table public.usage_events
  drop constraint if exists usage_events_feature_chk;

alter table public.usage_events
  add constraint usage_events_feature_chk check (
    feature in ('analyses', 'ai_grading', 'voice_mock', 'custom_scenarios', 'story_ai', 'resume_tailor')
  );
