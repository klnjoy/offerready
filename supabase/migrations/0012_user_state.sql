-- OfferReady SaaS — account sync of the app's local data (user_state)
-- =============================================================================
-- Most of a user's work (interview dates, plan checkmarks, STAR stories,
-- debriefs, offers, the active job, the readiness cache, the trade-off drill
-- role, help-bot chats, practice progress) lives in the browser's
-- localStorage. This table keeps a copy per account so it follows the user to
-- other devices and survives a cleared browser.
--
-- One row per (user, localStorage key). `value` is the app's envelope:
--   { "v": <json> } | { "s": "<raw string>" } | { "gone": true }
--   plus optional "del": { itemId: ms } tombstones for list/map keys.
-- `updated_at` is set by the client to the time of the change (last write
-- wins per key / per item; see web app src/lib/syncMerge.ts).
--
-- The saved resume is synced ONLY when the user opts in on a device.
--
-- Security (mirrors 0002_rls.sql conventions):
--   * The browser talks to this table directly with the user's session
--     (supabase-js + RLS); there is no API function in between.
--   * RLS: a user can select / insert / update / delete ONLY their own rows
--     (auth.uid() = user_id). anon has no access.
--   * Limits: key format check, value at most 200 000 bytes (as text), at
--     most 64 rows per user (trigger), so the table can't be used as
--     general-purpose storage.
--   * Rows go away with the account (FK on delete cascade).
--
-- FAIL-SAFE: until this migration is applied the app logs once and keeps
-- working on the device only ("Sync isn't set up yet").
--
-- Idempotent: safe to re-run.
-- =============================================================================

create table if not exists public.user_state (
  user_id     uuid not null references auth.users(id) on delete cascade,
  key         text not null,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, key)
);

-- Constraints are added separately so a re-run on an existing table works.
alter table public.user_state drop constraint if exists user_state_key_chk;
alter table public.user_state add constraint user_state_key_chk check (
  key ~ '^(offerready\.|ip_|or_)[A-Za-z0-9._:-]{1,96}$'
);

alter table public.user_state drop constraint if exists user_state_value_size_chk;
alter table public.user_state add constraint user_state_value_size_chk check (
  octet_length(value::text) <= 200000
);

alter table public.user_state drop constraint if exists user_state_value_object_chk;
alter table public.user_state add constraint user_state_value_object_chk check (
  jsonb_typeof(value) = 'object'
);

-- ---------------------------------------------------------------------------
-- Row cap per user (the app syncs ~13 keys; 64 leaves room to grow).
-- SECURITY INVOKER: the count only sees the caller's own rows under RLS,
-- which are exactly the rows being capped.
-- ---------------------------------------------------------------------------
create or replace function public.user_state_row_cap()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- An upsert of an existing key fires BEFORE INSERT too: let it through.
  if exists (select 1 from public.user_state where user_id = new.user_id and key = new.key) then
    return new;
  end if;
  if (select count(*) from public.user_state where user_id = new.user_id) >= 64 then
    raise exception 'user_state: row limit reached' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_user_state_row_cap on public.user_state;
create trigger trg_user_state_row_cap
  before insert on public.user_state
  for each row execute function public.user_state_row_cap();

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.user_state enable row level security;

revoke all on public.user_state from anon, authenticated;
grant select, insert, update, delete on public.user_state to authenticated;

drop policy if exists user_state_select_own on public.user_state;
create policy user_state_select_own on public.user_state
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_state_insert_own on public.user_state;
create policy user_state_insert_own on public.user_state
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists user_state_update_own on public.user_state;
create policy user_state_update_own on public.user_state
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_state_delete_own on public.user_state;
create policy user_state_delete_own on public.user_state
  for delete to authenticated
  using (auth.uid() = user_id);

-- The primary key (user_id, key) already serves "all rows of this user".
