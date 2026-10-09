-- OfferReady SaaS — in-app feedback ('feedback') and product events ('product_events')
-- =============================================================================
-- Both are written straight from the web app with the anon key (like
-- client_errors in 0013) and read only in the Supabase dashboard.
--
-- feedback        "Send feedback" form: a 1-5 rating, free text, the page it
--                 came from, and whether the user is happy to be contacted.
-- product_events  A small, fixed set of product steps (page views and key
--                 actions: job added, question practised, drill finished…)
--                 so we can see where beta users drop off. No content: no job
--                 descriptions, answers, resumes or emails. Props are a small
--                 JSON object of ids/counts only (<= 1 KB).
--
-- Access model (same as client_errors):
--   * anon and authenticated may INSERT only; nobody can read rows back
--     through the API. Read them in the dashboard (service role).
--   * user_id must be null (signed out) or the caller's own id.
--   * Length and size limits stop abusive payloads.
--   * Deleting an account keeps rows but clears user_id.
--
-- Funnel query (run in the SQL Editor):
--   select event, count(distinct coalesce(user_id::text, anon_id)) as people
--   from public.product_events
--   where created_at > now() - interval '14 days'
--   group by event order by people desc;
--
-- Idempotent: safe to re-run.
-- =============================================================================

create table if not exists public.feedback (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid null references auth.users (id) on delete set null,
  route       text,
  rating      smallint,
  message     text not null,
  contact_ok  boolean not null default false,
  release     text,
  ua          text
);

alter table public.feedback drop constraint if exists feedback_rating_chk;
alter table public.feedback drop constraint if exists feedback_message_chk;
alter table public.feedback drop constraint if exists feedback_route_chk;
alter table public.feedback drop constraint if exists feedback_release_chk;
alter table public.feedback drop constraint if exists feedback_ua_chk;
alter table public.feedback
  add constraint feedback_rating_chk  check (rating is null or rating between 1 and 5),
  add constraint feedback_message_chk check (char_length(message) between 1 and 2000),
  add constraint feedback_route_chk   check (route   is null or char_length(route)   <= 300),
  add constraint feedback_release_chk check (release is null or char_length(release) <= 64),
  add constraint feedback_ua_chk      check (ua      is null or char_length(ua)      <= 400);

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
grant insert (user_id, route, rating, message, contact_ok, release, ua) on public.feedback to anon, authenticated;

drop policy if exists feedback_insert_anon on public.feedback;
create policy feedback_insert_anon on public.feedback
  for insert to anon with check (user_id is null and contact_ok = false);

drop policy if exists feedback_insert_authenticated on public.feedback;
create policy feedback_insert_authenticated on public.feedback
  for insert to authenticated with check (user_id is null or user_id = auth.uid());

-- ---------------------------------------------------------------------------

create table if not exists public.product_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid null references auth.users (id) on delete set null,
  anon_id     text not null,
  session_id  text not null,
  event       text not null,
  route       text,
  props       jsonb not null default '{}'::jsonb,
  release     text
);

alter table public.product_events drop constraint if exists product_events_event_chk;
alter table public.product_events drop constraint if exists product_events_ids_chk;
alter table public.product_events drop constraint if exists product_events_route_chk;
alter table public.product_events drop constraint if exists product_events_props_chk;
alter table public.product_events drop constraint if exists product_events_release_chk;
alter table public.product_events
  add constraint product_events_event_chk   check (event ~ '^[a-z][a-z0-9_]{1,39}$'),
  add constraint product_events_ids_chk     check (char_length(anon_id) between 8 and 40 and char_length(session_id) between 8 and 40),
  add constraint product_events_route_chk   check (route is null or char_length(route) <= 300),
  add constraint product_events_props_chk   check (jsonb_typeof(props) = 'object' and octet_length(props::text) <= 1000),
  add constraint product_events_release_chk check (release is null or char_length(release) <= 64);

create index if not exists product_events_created_idx on public.product_events (created_at desc);
create index if not exists product_events_event_idx on public.product_events (event, created_at desc);

alter table public.product_events enable row level security;
revoke all on public.product_events from anon, authenticated;
grant insert (user_id, anon_id, session_id, event, route, props, release) on public.product_events to anon, authenticated;

drop policy if exists product_events_insert_anon on public.product_events;
create policy product_events_insert_anon on public.product_events
  for insert to anon with check (user_id is null);

drop policy if exists product_events_insert_authenticated on public.product_events;
create policy product_events_insert_authenticated on public.product_events
  for insert to authenticated with check (user_id is null or user_id = auth.uid());

-- No SELECT / UPDATE / DELETE policies on purpose (dashboard only).
