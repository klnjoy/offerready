-- OfferReady SaaS — daily "question of the day" push notifications
-- =============================================================================
-- One row per browser/device that turned on the daily question. The push is
-- sent with no payload: the app's service worker picks the day's question
-- itself, so nothing about the user travels through the push service.
--
-- Access model: RLS on, no grants to anon/authenticated. Rows are written and
-- read only by the backend (service-role key): POST/DELETE /api/me/plan?op=push
-- and the daily cron (/api/cron/daily-question). Deleting an account deletes
-- its subscriptions.
--
-- Idempotent: safe to re-run.
-- =============================================================================

create table if not exists public.push_subscriptions (
  endpoint      text primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  p256dh        text,
  auth          text,
  created_at    timestamptz not null default now(),
  last_sent_at  timestamptz,
  fail_count    integer not null default 0
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
