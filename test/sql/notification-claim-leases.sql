begin;
do $$
declare
  event_key text := '__lease_verification__:' || gen_random_uuid();
  old_event text := '__window_verification__:' || gen_random_uuid();
  first_claim public.notification_outbox%rowtype;
  next_claim public.notification_outbox%rowtype;
  matched integer;
begin
  insert into public.notification_outbox(notification_key,recipient,subject,body_text,status)
    values(event_key,'verification@example.invalid','Synthetic verification','No email is sent','pending');
  select * into first_claim from public.claim_notification_v2(event_key);
  if first_claim.claim_token is null or first_claim.status <> 'sending' then raise exception 'claim missing'; end if;
  if first_claim.retry_until-first_claim.first_attempt_at <> interval '23 hours' then raise exception 'retry window changed'; end if;
  select count(*) into matched from public.claim_notification_v2(event_key);
  if matched <> 0 then raise exception 'active claim duplicated'; end if;
  update public.notification_outbox set claim_expires_at=clock_timestamp()-interval '1 second' where notification_key=event_key;
  select * into next_claim from public.claim_notification_v2(event_key);
  if next_claim.claim_token is null or next_claim.claim_token=first_claim.claim_token then raise exception 'expired claim not reclaimed'; end if;
  if next_claim.first_attempt_at<>first_claim.first_attempt_at or next_claim.retry_until<>first_claim.retry_until then raise exception 'retry deadline extended'; end if;
  perform public.release_notification_v2(event_key,first_claim.claim_token);
  if (select claim_token from public.notification_outbox where notification_key=event_key)<>next_claim.claim_token then raise exception 'old release changed owner'; end if;
  select count(*) into matched from public.mark_notification_sent_v2(event_key,first_claim.claim_token);
  if matched<>0 then raise exception 'old worker acknowledged new claim'; end if;
  perform public.mark_notification_sent_v2(event_key,next_claim.claim_token);
  if (select status from public.notification_outbox where notification_key=event_key)<>'sent' then raise exception 'current worker could not acknowledge'; end if;

  insert into public.notification_outbox(notification_key,recipient,subject,body_text,status,first_attempt_at,retry_until)
    values(old_event,'verification@example.invalid','Synthetic verification','No email is sent','pending',clock_timestamp()-interval '24 hours',clock_timestamp()-interval '1 hour');
  select count(*) into matched from public.claim_notification_v2(old_event);
  if matched<>0 or (select status from public.notification_outbox where notification_key=old_event)<>'reconciliation-required' then raise exception 'expired window replayed'; end if;
  if exists(select 1 from (values('public.claim_notification_v2(text)'),('public.release_notification_v2(text,uuid)'),('public.mark_notification_sent_v2(text,uuid)')) as signatures(name)
    where has_function_privilege('anon',name,'execute') or has_function_privilege('authenticated',name,'execute') or not has_function_privilege('service_role',name,'execute')) then raise exception 'incorrect notification function access'; end if;
  if exists(select 1 from pg_proc where oid in ('public.claim_notification_v2(text)'::regprocedure,'public.release_notification_v2(text,uuid)'::regprocedure,'public.mark_notification_sent_v2(text,uuid)'::regprocedure) and prosecdef) then raise exception 'privileged function bypass'; end if;
end;
$$;
rollback;
