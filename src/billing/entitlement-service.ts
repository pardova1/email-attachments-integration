import { createAnnualLicense, isLicenseActive, planForAmount, type LicensePlan } from "./annual-license.js";
import type { LicenseRepository } from "./license-repository.js";
import type { PaymentProvider } from "./payment-provider.js";
export class EntitlementService {
  constructor(private readonly payments:PaymentProvider,private readonly licenses:LicenseRepository){}
  async activateFromPayment(providerReference:string,licenseName?:string){
    const payment=await this.payments.verifyPayment(providerReference);
    if(payment.status!=="paid") throw new Error("PAYMENT_NOT_COMPLETED");
    const plan=planForAmount(payment.amountUsdCents);
    const existing=await this.licenses.getByUserIdAndPlan(payment.userId,plan);
    const license=createAnnualLicense(payment.userId,payment.paidAt,plan,existing,licenseName);
    await this.licenses.save(license); return license;
  }
  async requireActive(userId:string,now=new Date(),plan?:LicensePlan){
    const candidates=plan ? [await this.licenses.getByUserIdAndPlan(userId,plan)] : await this.licenses.listByUserId(userId);
    const license=candidates.find(x=>x&&isLicenseActive(x,now));
    if(!license) throw new Error("ACTIVE_LICENSE_REQUIRED"); return license;
  }
}
