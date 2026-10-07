import type { AnnualLicense, LicensePlan } from "../billing/annual-license.js";
import type { AppliedLicensePayment, LicensePaymentApplicationRepository } from "../billing/license-payment-application-repository.js";
type PaymentRow={applied:boolean;user_id:string;plan:LicensePlan;license_name:string;starts_at:string;expires_at:string;amount_paid_usd_cents:number;status:"active"|"expired"};
export class SupabaseLicensePaymentApplicationRepository implements LicensePaymentApplicationRepository {
  constructor(private readonly url:string,private readonly secretKey:string){}
  async apply(input:Parameters<LicensePaymentApplicationRepository["apply"]>[0]):Promise<AppliedLicensePayment>{
    const r=await fetch(`${this.url}/rest/v1/rpc/apply_annual_license_payment`,{method:"POST",headers:{apikey:this.secretKey,Authorization:`Bearer ${this.secretKey}`,"content-type":"application/json"},body:JSON.stringify({p_provider_reference:input.providerReference,p_user_id:input.userId,p_plan:input.plan,p_license_name:input.licenseName??"",p_amount_paid_usd_cents:input.amountPaidUsdCents,p_paid_at:input.paidAt.toISOString()})});
    if(!r.ok) throw new Error("LICENSE_PAYMENT_APPLICATION_FAILED");
    const rows=await r.json() as PaymentRow[]; const row=rows[0];
    if(!row) throw new Error("LICENSE_PAYMENT_APPLICATION_FAILED");
    const license:AnnualLicense={userId:row.user_id,plan:row.plan,licenseName:row.license_name,startsAt:new Date(row.starts_at),expiresAt:new Date(row.expires_at),amountPaidUsdCents:row.amount_paid_usd_cents,status:row.status};
    return {applied:row.applied,license};
  }
}
