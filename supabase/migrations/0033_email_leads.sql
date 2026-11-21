-- Optional email sign-up for people who have no account yet (Open roles).
--
-- A visitor gives an email, the role type (family) and country they care about.
-- Double opt-in: the row starts 'pending' and only becomes 'confirmed' when they
-- click the link in the confirmation email. Confirmed leads get at most one
-- weekly digest of new roles in that family and country. Every email carries a
-- one-click unsubscribe link and the postal address.
--
-- Leads have no auth.users row, so they're tracked here, not in email_sends.
-- Only the API (service role) touches this table.

create table if not exists public.email_leads (
  id              uuid primary key default gen_random_uuid(),
  email           text not null check (email = lower(email) and length(email) between 5 and 254),
  family          text not null default '' check (length(family) <= 20),
  cc              text not null default '' check (cc ~ '^([A-Z]{2})?$'),
  status          text not null default 'pending' check (status in ('pending', 'confirmed', 'unsubscribed')),
  created_at      timestamptz not null default now(),
  confirm_sent_at timestamptz,
  confirmed_at    timestamptz,
  last_sent_at    timestamptz,
  unsubscribed_at timestamptz,
  unique (email)
);
alter table public.email_leads enable row level security;
revoke all on table public.email_leads from public, anon, authenticated;

create index if not exists email_leads_confirmed_idx on public.email_leads (status) where status = 'confirmed';
