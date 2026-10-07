create table if not exists public.notification_outbox (
  notification_key text primary key,
  recipient text not null,
  subject text not null,
  body_text text not null,
  status text not null check (status in ('pending','sent')) default 'pending',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.notification_outbox enable row level security;
revoke all on table public.notification_outbox from anon, authenticated;
grant select, insert, update on table public.notification_outbox to service_role;
