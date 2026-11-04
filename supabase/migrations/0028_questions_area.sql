-- OfferReady — the topic ("area") each job question tests, e.g. "Retrieval
-- and vector search", so Practice can group a job's questions by what the
-- interviewer will test. Nullable; older questions simply have none.
-- Idempotent: safe to re-run. The API works before and after this runs.
alter table if exists public.questions add column if not exists area text;
