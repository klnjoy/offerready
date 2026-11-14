-- OfferReady — public reviews, by permission only
-- =============================================================================
-- A review is a signed-in user's own words, shown on the website only after
-- (1) they ticked "show this on the website" and (2) an admin approved it.
-- Feedback ('feedback', 0015) stays private; this is a separate table.
--
--   reviews            one row per user (a new review replaces the old one).
--   public_reviews()   anyone (anon) may call: approved reviews only, and only
--                      the fields meant for the page (first name, job title,
--                      rating, words, date). Never the user id or email.
--   admin_reviews()    service role only: every review with its status.
--   admin_review_set() service role only: approve / hide / back to pending.
--
-- A user can read, replace and delete (withdraw) only their own row; deleting
-- the account deletes it too. Approval is reset whenever the words change.
-- Idempotent: safe to re-run.
-- =============================================================================

create table if not exists public.reviews (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  user_id       uuid not null unique references auth.users (id) on delete cascade,
  rating        smallint not null,
  quote         text not null,
  display_name  text not null,
  display_role  text,
  status        text not null default 'pending',
  approved_at   timestamptz
);

alter table public.reviews drop constraint if exists reviews_rating_chk;
alter table public.reviews drop constraint if exists reviews_quote_chk;
alter table public.reviews drop constraint if exists reviews_name_chk;
alter table public.reviews drop constraint if exists reviews_role_chk;
alter table public.reviews drop constraint if exists reviews_status_chk;
alter table public.reviews
  add constraint reviews_rating_chk check (rating between 1 and 5),
  add constraint reviews_quote_chk  check (char_length(btrim(quote)) between 10 and 400),
  add constraint reviews_name_chk   check (char_length(btrim(display_name)) between 1 and 40),
  add constraint reviews_role_chk   check (display_role is null or char_length(display_role) <= 80),
  add constraint reviews_status_chk check (status in ('pending', 'approved', 'hidden'));

create index if not exists reviews_status_idx on public.reviews (status, approved_at desc);

-- Any change to the words, rating, name or title by the user sends it back to
-- "pending", so nothing reaches the website without a fresh approval.
create or replace function public.reviews_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and current_user <> 'service_role'
     and (new.quote is distinct from old.quote or new.rating is distinct from old.rating
          or new.display_name is distinct from old.display_name or new.display_role is distinct from old.display_role) then
    new.status := 'pending';
    new.approved_at := null;
  end if;
  if tg_op = 'INSERT' and current_user <> 'service_role' then
    new.status := 'pending';
    new.approved_at := null;
  end if;
  return new;
end $$;

drop trigger if exists reviews_touch on public.reviews;
create trigger reviews_touch before insert or update on public.reviews
  for each row execute function public.reviews_touch();

alter table public.reviews enable row level security;
revoke all on public.reviews from anon, authenticated;
grant select, delete on public.reviews to authenticated;
grant insert (user_id, rating, quote, display_name, display_role) on public.reviews to authenticated;
grant update (rating, quote, display_name, display_role) on public.reviews to authenticated;

drop policy if exists reviews_own_select on public.reviews;
drop policy if exists reviews_own_insert on public.reviews;
drop policy if exists reviews_own_update on public.reviews;
drop policy if exists reviews_own_delete on public.reviews;
create policy reviews_own_select on public.reviews for select to authenticated using (user_id = auth.uid());
create policy reviews_own_insert on public.reviews for insert to authenticated with check (user_id = auth.uid());
create policy reviews_own_update on public.reviews for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reviews_own_delete on public.reviews for delete to authenticated using (user_id = auth.uid());

-- What the website shows: approved reviews only, page fields only.
create or replace function public.public_reviews()
returns table (display_name text, display_role text, rating smallint, quote text, approved_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.display_name, r.display_role, r.rating, r.quote, r.approved_at
  from public.reviews r
  where r.status = 'approved'
  order by r.approved_at desc nulls last
  limit 12
$$;
revoke all on function public.public_reviews() from public;
grant execute on function public.public_reviews() to anon, authenticated;

-- Admin: every review, newest first, with the reviewer's email for context.
create or replace function public.admin_reviews()
returns table (id bigint, created_at timestamptz, updated_at timestamptz, email text, rating smallint, quote text,
               display_name text, display_role text, status text, approved_at timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select r.id, r.created_at, r.updated_at, u.email::text, r.rating, r.quote, r.display_name, r.display_role, r.status, r.approved_at
  from public.reviews r left join auth.users u on u.id = r.user_id
  order by (r.status = 'pending') desc, r.updated_at desc
  limit 200
$$;
revoke all on function public.admin_reviews() from public, anon, authenticated;
grant execute on function public.admin_reviews() to service_role;

drop function if exists public.admin_review_set(bigint, text);
create or replace function public.admin_review_set(p_id bigint, p_status text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('pending', 'approved', 'hidden') then raise exception 'bad status'; end if;
  update public.reviews
     set status = p_status,
         approved_at = case when p_status = 'approved' then now() else null end
   where id = p_id;
  return found;
end $$;
revoke all on function public.admin_review_set(bigint, text) from public, anon, authenticated;
grant execute on function public.admin_review_set(bigint, text) to service_role;
