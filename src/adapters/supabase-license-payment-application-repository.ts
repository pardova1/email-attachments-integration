import type { AnnualLicense } from "../billing/annual-license.js";
import type { AppliedLicensePayment, LicensePaymentApplicationRepository } from "../billing/license-payment-application-repository.js";
export class SupabaseLicensePaymentApplicationRepository implements LicensePaymentApplicationRepository {
  constructor(private readonly url:string,private readonly secretKey:string){}
  async apply(input:Parameters<LicensePaymentApplicationRepository["apply"]>[0]):Promise<AppliedLicensePayment>{
    const r=await fetch(`${this.url}/rest/v1/rpc/apply_annual_license_payment`,{method:"POST",headers:{apikey:this.secretKey,Authorization:`Bearer ${this.secretKey}`,"content-type":"application/json"},body:JSON.stringify({p_provider_reference:input.providerReference,p_user_id:input.userId,p_plan:input.plan,p_license_name:input.licenseName??"",p_amount_paid_usd_cents:input.amountPaidUsdCents,p_paid_at:input.paidAt.toISOString()})});
    if(!r.ok) throw new Error("LICENSE_PAYMENT_APPLICATION_FAILED");
    const rows=await r.json() as Array<{applied:boolean;starts_at:string;expires_at:string}>;
    if(!rows[0]) throw new Error("LICENSE_PAYMENT_APPLICATION_FAILED");
    const license:AnnualLicense={userId:input.userId,plan:input.plan,licenseName:input.licenseName??input.plan,startsAt:new Date(rows[0].starts_at),expiresAt:new Date(rows[0].expires_at),amountPaidUsdCents:input.amountPaidUsdCents,status:"active"};
    return {applied:rows[0].applied,license};
  }
}
