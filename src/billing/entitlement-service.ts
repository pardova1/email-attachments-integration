import { planForAmount } from "./annual-license.js";
import type { LicensePaymentApplicationRepository } from "./license-payment-application-repository.js";
import type { LicenseRepository } from "./license-repository.js";
import type { PaymentProvider } from "./payment-provider.js";
export class EntitlementService {
  constructor(private readonly payments:PaymentProvider,private readonly licenses:LicenseRepository,private readonly applications?:LicensePaymentApplicationRepository){}
  async activateFromPayment(providerReference:string,licenseName?:string){
    const payment=await this.payments.verifyPayment(providerReference);
    if(payment.status!=="paid") throw new Error("PAYMENT_NOT_COMPLETED");
    const plan=planForAmount(payment.amountUsdCents);
    if(!this.applications) throw new Error("PAYMENT_IDEMPOTENCY_NOT_CONFIGURED");
    return (await this.applications.apply({providerReference,userId:payment.userId,plan,licenseName,amountPaidUsdCents:payment.amountUsdCents,paidAt:payment.paidAt})).license;
  }
  async requireActive(userId:string,now=new Date(),plan?:import("./annual-license.js").LicensePlan){
    const candidates=plan ? [await this.licenses.getByUserIdAndPlan(userId,plan)] : await this.licenses.listByUserId(userId);
    const { isLicenseActive }=await import("./annual-license.js");
    const license=candidates.find(x=>x&&isLicenseActive(x,now));
    if(!license) throw new Error("ACTIVE_LICENSE_REQUIRED"); return license;
  }
}
