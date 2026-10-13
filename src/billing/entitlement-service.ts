import { planForAmount } from "./annual-license.js";
import type { LicensePaymentApplicationRepository } from "./license-payment-application-repository.js";
import type { LicenseRepository } from "./license-repository.js";
import type { PaymentProvider } from "./payment-provider.js";
export class EntitlementService {
  constructor(private readonly payments:PaymentProvider,private readonly licenses:LicenseRepository,private readonly applications?:LicensePaymentApplicationRepository){}
  async licenseStatus(userId:string,at?:Date){
    const stored=await this.licenses.listByUserId(userId),now=at??new Date(),time=now.getTime(),plans=new Set<string>();
    if(!Number.isFinite(time)||stored.length>2)throw new Error("LICENSE_STATUS_UNAVAILABLE");
    const licenses=stored.map(license=>{
      const start=license.startsAt.getTime(),end=license.expiresAt.getTime();
      if(license.userId!==userId||!["individual","business"].includes(license.plan)||plans.has(license.plan)||!["active","expired"].includes(license.status)||!Number.isFinite(start)||!Number.isFinite(end)||end<=start||planForAmount(license.amountPaidUsdCents)!==license.plan)throw new Error("LICENSE_STATUS_UNAVAILABLE");
      plans.add(license.plan);
      return {plan:license.plan,startsAt:license.startsAt.toISOString(),expiresAt:license.expiresAt.toISOString(),amountPaidUsdCents:license.amountPaidUsdCents,status:license.status,active:license.status==="active"&&start<=time&&time<end};
    }).sort((a,b)=>a.plan.localeCompare(b.plan));
    return {checkedAt:now.toISOString(),licenses};
  }
  async activateFromPayment(providerReference:string,licenseName?:string,context?:{expectedUserId:string;beforeApply:()=>void}){
    const payment=await this.payments.verifyPayment(providerReference);
    if(payment.status!=="paid") throw new Error("PAYMENT_NOT_COMPLETED");
    if(payment.providerReference!==providerReference)throw new Error("PAYMENT_REFERENCE_MISMATCH");
    if(context&&payment.userId!==context.expectedUserId)throw new Error("PAYMENT_CUSTOMER_MISMATCH");
    const plan=planForAmount(payment.amountUsdCents);
    if(!this.applications) throw new Error("PAYMENT_IDEMPOTENCY_NOT_CONFIGURED");
    context?.beforeApply();
    return (await this.applications.apply({providerReference,userId:payment.userId,plan,licenseName,amountPaidUsdCents:payment.amountUsdCents,paidAt:payment.paidAt})).license;
  }
  async requireActive(userId:string,now=new Date(),plan?:import("./annual-license.js").LicensePlan){
    const candidates=plan ? [await this.licenses.getByUserIdAndPlan(userId,plan)] : await this.licenses.listByUserId(userId);
    const { isLicenseActive }=await import("./annual-license.js");
    const license=candidates.find(x=>x&&isLicenseActive(x,now));
    if(!license) throw new Error("ACTIVE_LICENSE_REQUIRED"); return license;
  }
}
