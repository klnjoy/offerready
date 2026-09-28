-- OfferReady SaaS — RLS access tests (Phase 2)
-- =============================================================================
-- Spec §29 (subset that applies to the DB layer). Verifies Row Level Security
-- allows/denies exactly as intended. Runs as a single transaction and ROLLS
-- BACK at the end, so it leaves no data behind.
--
-- How to run (any of):
--   * Supabase SQL Editor: paste this whole file and Run. It RAISES on failure.
--   * psql:  psql "$DATABASE_URL" -f supabase/tests/rls_test.sql
--
-- Mechanism: Supabase's auth.uid() reads request.jwt.claims->>'sub'. We
-- impersonate the API roles with SET ROLE and set that claim per test.
--
-- A failed assertion RAISES EXCEPTION and aborts (non-zero) — a passing run
-- prints "ALL RLS TESTS PASSED".
-- =============================================================================

begin;

-- Two fake users. We insert into auth.users directly (allowed as the migration
-- owner / postgres before we SET ROLE). If your test DB forbids that, create
-- these users via the Auth API first and paste their UUIDs here.
do $$
declare
  u1 uuid := '11111111-1111-1111-1111-111111111111';
  u2 uuid := '22222222-2222-2222-2222-222222222222';
begin
  insert into auth.users (id, email) values
    (u1, 'user1@example.test'),
    (u2, 'user2@example.test')
  on conflict (id) do nothing;

  -- Ensure profiles exist (trigger may or may not fire in the test harness).
  insert into public.profiles (id, email) values
    (u1, 'user1@example.test'), (u2, 'user2@example.test')
  on conflict (id) do nothing;

  -- Seed data owned by user1.
  insert into public.entitlements (user_id, feature, status)
    values (u1, 'interview_pro', 'active') on conflict do nothing;
  insert into public.user_progress (user_id, category, sessions_count)
    values (u1, 'rag', 3) on conflict do nothing;
  insert into public.subscriptions (user_id, status, plan)
    values (u1, 'active', 'pro') on conflict do nothing;

  -- Seed protected premium content.
  insert into public.premium_content (slug, title, required_entitlement, content, published)
    values ('secret-scenario', 'Secret', 'interview_pro',
            '{"answer":"PROTECTED"}'::jsonb, true)
    on conflict (slug) do nothing;
end $$;

-- Helper: assert a boolean, RAISE on failure.
create or replace function pg_temp.assert(cond boolean, msg text)
returns void language plpgsql as $$
begin
  if not cond then
    raise exception 'RLS TEST FAILED: %', msg;
  end if;
end;
$$;

-- Helper: count rows visible in a table under the current role/claims,
-- treating a permission-denied error as 0 visible rows.
create or replace function pg_temp.visible_count(tbl text)
returns integer language plpgsql as $$
declare n integer;
begin
  execute format('select count(*) from %s', tbl) into n;
  return n;
exception when insufficient_privilege then
  return -1;   -- signals hard GRANT denial
end;
$$;

-- ===========================================================================
-- TEST 1 — anonymous cannot read user tables (§29: anon → premium denied)
-- ===========================================================================
set local role anon;
select set_config('request.jwt.claims', '{}', true);

perform pg_temp.assert(pg_temp.visible_count('public.premium_content') <= 0,
  'anon must not read premium_content');
perform pg_temp.assert(pg_temp.visible_count('public.entitlements') <= 0,
  'anon must not read entitlements');
perform pg_temp.assert(pg_temp.visible_count('public.subscriptions') <= 0,
  'anon must not read subscriptions');
perform pg_temp.assert(pg_temp.visible_count('public.user_progress') <= 0,
  'anon must not read user_progress');
-- features is a public catalog: anon SHOULD see it.
perform pg_temp.assert(pg_temp.visible_count('public.features') > 0,
  'anon should read features catalog');
reset role;

-- ===========================================================================
-- TEST 2 — user1 sees ONLY their own rows (§29: own allowed)
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

perform pg_temp.assert(
  (select count(*) from public.entitlements) = 1,
  'user1 should see exactly their 1 entitlement');
perform pg_temp.assert(
  (select count(*) from public.user_progress) = 1,
  'user1 should see exactly their 1 progress row');
perform pg_temp.assert(
  (select count(*) from public.subscriptions) = 1,
  'user1 should see their subscription');
-- Premium content is server-only: even an entitled, authenticated user gets 0
-- rows directly from the client role (must go through the backend).
perform pg_temp.assert(pg_temp.visible_count('public.premium_content') <= 0,
  'authenticated must not read premium_content directly');
reset role;

-- ===========================================================================
-- TEST 3 — user2 CANNOT see user1's rows (§29: cross-user denied by RLS)
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

perform pg_temp.assert(
  (select count(*) from public.entitlements) = 0,
  'user2 must NOT see user1 entitlements');
perform pg_temp.assert(
  (select count(*) from public.user_progress) = 0,
  'user2 must NOT see user1 progress');
perform pg_temp.assert(
  (select count(*) from public.subscriptions) = 0,
  'user2 must NOT see user1 subscription');
reset role;

-- ===========================================================================
-- TEST 4 — user2 cannot WRITE a row impersonating user1 (§29: RLS with check)
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

do $$
begin
  begin
    insert into public.user_progress (user_id, category)
      values ('11111111-1111-1111-1111-111111111111', 'agents');
    raise exception 'RLS TEST FAILED: user2 was able to insert progress as user1';
  exception
    when insufficient_privilege or check_violation then
      null;  -- expected: RLS with-check blocks it
  end;
end $$;
reset role;

select 'ALL RLS TESTS PASSED' as result;

rollback;
