alter table public.notification_outbox
  add column if not exists first_attempt_at timestamptz,
  add column if not exists retry_until timestamptz,
  add column if not exists claim_token uuid,
  add column if not exists claim_expires_at timestamptz;
alter table public.notification_outbox drop constraint if exists notification_outbox_status_check;
alter table public.notification_outbox add constraint notification_outbox_status_check
  check (status in ('pending','sending','sent','reconciliation-required'));

-- Legacy unsent rows have no reliable attempt history. Never guess that a
-- provider did not accept them. New reservations start with no attempt window.
update public.notification_outbox set status='reconciliation-required',claim_token=null,claim_expires_at=null
where status in ('pending','sending') and first_attempt_at is null;

create or replace function public.claim_notification_v2(p_notification_key text)
returns setof public.notification_outbox
language plpgsql security invoker set search_path=''
as $$
declare item public.notification_outbox%rowtype; v_claim_now timestamptz := clock_timestamp();
begin
  select * into item from public.notification_outbox
    where notification_key=p_notification_key for update skip locked;
  if not found or item.status in ('sent','reconciliation-required') then return; end if;
  if item.status='sending' and item.claim_expires_at>v_claim_now then return; end if;
  if (item.first_attempt_at is not null and (item.retry_until is null or item.retry_until<=v_claim_now))
    or (item.status='sending' and item.first_attempt_at is null) then
    update public.notification_outbox set status='reconciliation-required',claim_token=null,claim_expires_at=null
      where notification_key=p_notification_key;
    return;
  end if;
  return query update public.notification_outbox
    set status='sending',claim_token=gen_random_uuid(),
      first_attempt_at=coalesce(item.first_attempt_at,v_claim_now),
      retry_until=coalesce(item.retry_until,v_claim_now+interval '23 hours'),
      claim_expires_at=least(v_claim_now+interval '2 minutes',coalesce(item.retry_until,v_claim_now+interval '23 hours'))
    where notification_key=p_notification_key returning *;
end;
$$;

create or replace function public.release_notification_v2(p_notification_key text,p_claim_token uuid)
returns setof public.notification_outbox
language sql security invoker set search_path=''
as $$
  update public.notification_outbox set status='pending',claim_token=null,claim_expires_at=null
    where notification_key=p_notification_key and status='sending' and claim_token=p_claim_token returning *;
$$;

create or replace function public.mark_notification_sent_v2(p_notification_key text,p_claim_token uuid)
returns setof public.notification_outbox
language sql security invoker set search_path=''
as $$
  update public.notification_outbox set status='sent',sent_at=clock_timestamp(),claim_token=null,claim_expires_at=null
    where notification_key=p_notification_key and status='sending' and claim_token=p_claim_token returning *;
$$;

revoke execute on function public.claim_notification_v2(text) from public,anon,authenticated;
revoke execute on function public.release_notification_v2(text,uuid) from public,anon,authenticated;
revoke execute on function public.mark_notification_sent_v2(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_notification_v2(text) to service_role;
grant execute on function public.release_notification_v2(text,uuid) to service_role;
grant execute on function public.mark_notification_sent_v2(text,uuid) to service_role;
-- Obsolete claims cannot bypass lease ownership or retry-window checks.
revoke execute on function public.claim_notification(text) from service_role;
notify pgrst,'reload schema';
