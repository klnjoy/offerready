-- Career-profile sync (item 10 of the ATS + career-profile build).
--
-- The app's career profile (lib/careerProfile.ts) now follows the account
-- through public.user_state (migration 0012), as one extra row per user:
--
--   key   offerready.careerProfile.sync.v1
--   value { "v": { "v": 1, "at": <ms>, "story": {...} | null,
--           "storyEdited": <bool>, "goal": "", "roles": [...],
--           "level": "", "jobTypes": [...], "workStyle": [...],
--           "location": "", "doneAt": null } }
--
--   Last write wins by `at` (the ms of the save); the client merges it into
--   the profile it shows (lib/syncMerge.ts, kind "lww").
--
-- Privacy: the synced copy is SCRUBBED. Work authorization and salary never
-- leave the device — they live only in the raw profile key
-- (offerready.careerProfile.v1), which the client deliberately does NOT
-- sync. No server code reads this row; the browser syncs it directly with
-- the user's session (RLS: own rows only), like every other user_state key.
--
-- No schema change is needed for this key, and none is made here:
--   * the 0012 key check already allows the `offerready.*` prefix,
--   * the 64-rows-per-user cap still has room (the app now syncs 23 keys
--     at most, resume included — the "~13 keys" note in 0012 is stale),
--   * the 200 000-byte value limit is far above a profile (a few KB).
-- This migration only registers the key on the table itself, so the schema
-- (not just the app) records which keys the client syncs. Applying it is
-- housekeeping, not a prerequisite: sync works with or without it, and the
-- client keeps working locally if the table is missing (fail-safe).
--
-- Idempotent: safe to re-run.
-- =============================================================================

comment on table public.user_state is
  'Account sync of the app''s local data (one row per (user, key); see '
  'migration 0012). Synced keys (app lib/syncMerge.ts SYNC_SPECS, 23 at most): '
  'offerready.interviewDates.v1, offerready.prepPlan.v1, '
  'offerready.questionProgress.v1, offerready.codingProgress.v1, '
  'offerready.jobOutcomes.v1, offerready.applications.v1, '
  'offerready.jobDirectory.v1, offerready.practiceRounds.v1, '
  'offerready.mockLog.v1, offerready.stories.v1, offerready.answers.v1, '
  'offerready.practiced.v1, offerready.debriefs.v1, offerready.offers.v1, '
  'offerready.activeJob.v1, offerready.readiness.cache.v1, '
  'offerready.defendRole.v1, offerready.help.chats.v1, ip_history_v1, '
  'ip_activity_v1, or_scenario_sessions_v1, offerready.resume.v1 (opt-in only), '
  'offerready.careerProfile.sync.v1 (scrubbed profile: roles, level, story, '
  'goal, preferences — never work authorization or salary; the raw key '
  'offerready.careerProfile.v1 is never synced).';
