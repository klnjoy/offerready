-- OfferReady — one free job analysis before sign-in.
-- A visitor who isn't signed in may analyze a job to see what it needs before
-- creating an account. To keep the AI cost bounded this counts previews per
-- day: per network (a one-way hash of the IP address made by the API; the
-- address itself is never stored) and in total. take_anon_preview() checks and
-- counts in one step and says yes or no. Only the service role can use it.
-- Rows older than 7 days are removed as new ones come in.
-- Idempotent: safe to re-run.

create table if not exists public.anon_previews (
  key   text not null check (char_length(key) between 16 and 128),
  day   date not null default (now() at time zone 'utc')::date,
  n     integer not null default 0,
  primary key (key, day)
);
alter table public.anon_previews enable row level security;
revoke all on table public.anon_previews from public, anon, authenticated;

create or replace function public.take_anon_preview(p_key text, p_per_key int, p_per_day int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'utc')::date;
  used_key int;
  used_all int;
begin
  -- One caller at a time per day, so the total cap holds under load.
  perform pg_advisory_xact_lock(hashtext('anon_previews:' || today::text));
  delete from anon_previews where day < today - 7;
  select coalesce(sum(n), 0) into used_all from anon_previews where day = today;
  select coalesce(max(n), 0) into used_key from anon_previews where key = p_key and day = today;
  if used_key >= p_per_key or used_all >= p_per_day then
    return false;
  end if;
  insert into anon_previews (key, day, n) values (p_key, today, 1)
    on conflict (key, day) do update set n = anon_previews.n + 1;
  return true;
end;
$$;

revoke all on function public.take_anon_preview(text, int, int) from public, anon, authenticated;
grant execute on function public.take_anon_preview(text, int, int) to service_role;
