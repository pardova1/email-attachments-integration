alter table public.notification_outbox drop constraint if exists notification_outbox_status_check;
alter table public.notification_outbox add constraint notification_outbox_status_check check (status in ('pending','sending','sent'));
create or replace function public.claim_notification(p_notification_key text)
returns table(notification_key text,recipient text,subject text,body_text text,status text)
language sql security invoker set search_path=public
as $$ update public.notification_outbox set status='sending' where notification_outbox.notification_key=p_notification_key and notification_outbox.status='pending' returning notification_outbox.notification_key,notification_outbox.recipient,notification_outbox.subject,notification_outbox.body_text,notification_outbox.status; $$;
revoke execute on function public.claim_notification(text) from public,anon,authenticated;
grant execute on function public.claim_notification(text) to service_role;
