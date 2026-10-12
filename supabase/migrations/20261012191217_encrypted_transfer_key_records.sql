-- Server-only encrypted key envelopes; no raw keys or browser grants.
create table public.transfer_key_records (
 key_reference text primary key check (key_reference ~ '^wrapped-key-[a-f0-9-]{36}$'),
 transfer_id text not null check (length(transfer_id) between 1 and 256),
 lane_id text not null check (length(lane_id) between 1 and 256),
 nonce text,
 ciphertext text,
 auth_tag text,
 created_at timestamptz not null default now(),
 retired_at timestamptz,
 constraint transfer_key_envelope_state check (
  (retired_at is null and nonce is not null and nonce ~ '^[a-f0-9]{24}$'
   and ciphertext is not null and ciphertext ~ '^[a-f0-9]{64}$'
   and auth_tag is not null and auth_tag ~ '^[a-f0-9]{32}$')
  or (retired_at is not null and nonce is null and ciphertext is null and auth_tag is null)
 )
);
alter table public.transfer_key_records enable row level security;
revoke all on public.transfer_key_records from public, anon, authenticated, service_role;
grant select, insert on public.transfer_key_records to service_role;
grant update (nonce, ciphertext, auth_tag, retired_at) on public.transfer_key_records to service_role;
-- No user policies: keys are reachable only through the privileged server.
