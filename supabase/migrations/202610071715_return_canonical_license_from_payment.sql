-- Return the canonical stored license so application code never reconstructs entitlement state from callback input.
drop function if exists public.apply_annual_license_payment(text,text,text,text,integer,timestamptz);
create function public.apply_annual_license_payment(
 p_provider_reference text,p_user_id text,p_plan text,p_license_name text,p_amount_paid_usd_cents integer,p_paid_at timestamptz)
returns table(applied boolean,user_id text,plan text,license_name text,starts_at timestamptz,expires_at timestamptz,amount_paid_usd_cents integer,status text)
language plpgsql set search_path to 'public'
as $$
declare v_existing public.annual_licenses%rowtype; v_payment public.processed_license_payments%rowtype; v_start timestamptz; v_exp timestamptz; v_applied boolean;
begin
 if p_plan not in ('individual','business') or (p_plan='individual' and p_amount_paid_usd_cents<>400) or (p_plan='business' and p_amount_paid_usd_cents<>1000) then raise exception 'INVALID_LICENSE_PAYMENT'; end if;
 if nullif(btrim(p_provider_reference),'') is null or nullif(btrim(p_user_id),'') is null then raise exception 'INVALID_LICENSE_PAYMENT'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_provider_reference,0));
 select * into v_payment from public.processed_license_payments where provider_reference=p_provider_reference;
 if found then
   if v_payment.user_id is distinct from p_user_id or v_payment.plan is distinct from p_plan or v_payment.amount_paid_usd_cents is distinct from p_amount_paid_usd_cents or v_payment.paid_at is distinct from p_paid_at then raise exception 'PAYMENT_REFERENCE_COLLISION'; end if;
   v_applied:=false;
 else
   select * into v_existing from public.annual_licenses where annual_licenses.user_id=p_user_id and annual_licenses.plan=p_plan for update;
   v_start:=case when v_existing.user_id is not null and v_existing.expires_at>p_paid_at then v_existing.starts_at else p_paid_at end;
   v_exp:=(case when v_existing.user_id is not null and v_existing.expires_at>p_paid_at then v_existing.expires_at else p_paid_at end)+interval '365 days';
   insert into public.processed_license_payments(provider_reference,user_id,plan,amount_paid_usd_cents,paid_at,resulting_expires_at) values(p_provider_reference,p_user_id,p_plan,p_amount_paid_usd_cents,p_paid_at,v_exp);
   insert into public.annual_licenses(user_id,plan,license_name,starts_at,expires_at,amount_paid_usd_cents,status,updated_at) values(p_user_id,p_plan,coalesce(nullif(p_license_name,''),coalesce(v_existing.license_name,p_plan)),v_start,v_exp,p_amount_paid_usd_cents,'active',now())
   on conflict on constraint annual_licenses_pkey do update set license_name=excluded.license_name,starts_at=excluded.starts_at,expires_at=excluded.expires_at,amount_paid_usd_cents=excluded.amount_paid_usd_cents,status='active',updated_at=now();
   v_applied:=true;
 end if;
 return query select v_applied,l.user_id,l.plan,l.license_name,l.starts_at,l.expires_at,l.amount_paid_usd_cents,l.status from public.annual_licenses l where l.user_id=p_user_id and l.plan=p_plan;
end $$;
revoke execute on function public.apply_annual_license_payment(text,text,text,text,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.apply_annual_license_payment(text,text,text,text,integer,timestamptz) to service_role;
