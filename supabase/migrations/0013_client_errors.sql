-- OfferReady SaaS — first-party client error reports ('client_errors')
-- =============================================================================
-- The web app (offerready-app, src/lib/errorReport.ts) reports uncaught
-- errors, unhandled promise rejections and React render errors here, instead
-- of using a third-party error SDK. Reports are scrubbed in the browser
-- before they are sent: no query strings, nothing that looks like an email
-- address or a token, at most 10 reports per browser session.
--
-- Access model:
--   * anon and authenticated may INSERT only. There is NO select, update or
--     delete for clients, so nobody can read reports back through the API
--     (including their own). Read them in the Supabase dashboard (Table
--     Editor or SQL Editor), which uses the service role.
--   * user_id is optional. A signed-out report must leave it null; a
--     signed-in one may only carry the caller's own id (auth.uid()).
--   * Length limits keep a misbehaving or abusive client from storing large
--     payloads (message <= 1000, stack <= 8000 characters).
--   * Deleting an account keeps its reports but clears user_id
--     (on delete set null).
--
-- Retention: nothing deletes old rows automatically. To trim, run e.g.
--   delete from public.client_errors where created_at < now() - interval '90 days';
--
-- Idempotent: safe to re-run.
-- =============================================================================

create table if not exists public.client_errors (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid null references auth.users (id) on delete set null,
  route       text,
  message     text not null,
  stack       text,
  ua          text,
  release     text
);

-- (Re)create the length checks by name so re-running stays clean.
alter table public.client_errors drop constraint if exists client_errors_message_chk;
alter table public.client_errors drop constraint if exists client_errors_stack_chk;
alter table public.client_errors drop constraint if exists client_errors_route_chk;
alter table public.client_errors drop constraint if exists client_errors_ua_chk;
alter table public.client_errors drop constraint if exists client_errors_release_chk;

alter table public.client_errors
  add constraint client_errors_message_chk check (char_length(message) between 1 and 1000),
  add constraint client_errors_stack_chk   check (stack   is null or char_length(stack)   <= 8000),
  add constraint client_errors_route_chk   check (route   is null or char_length(route)   <= 300),
  add constraint client_errors_ua_chk      check (ua      is null or char_length(ua)      <= 400),
  add constraint client_errors_release_chk check (release is null or char_length(release) <= 64);

create index if not exists client_errors_created_at_idx on public.client_errors (created_at desc);

-- ---------------------------------------------------------------------------
-- RLS + grants: insert-only for the API roles.
-- ---------------------------------------------------------------------------
alter table public.client_errors enable row level security;

revoke all on public.client_errors from anon, authenticated;
grant insert (user_id, route, message, stack, ua, release) on public.client_errors to anon, authenticated;

drop policy if exists client_errors_insert_anon on public.client_errors;
create policy client_errors_insert_anon on public.client_errors
  for insert to anon
  with check (user_id is null);

drop policy if exists client_errors_insert_authenticated on public.client_errors;
create policy client_errors_insert_authenticated on public.client_errors
  for insert to authenticated
  with check (user_id is null or user_id = auth.uid());

-- No SELECT / UPDATE / DELETE policies on purpose: with RLS on, every client
-- read or change is denied. The service role (dashboard, server) bypasses RLS.
