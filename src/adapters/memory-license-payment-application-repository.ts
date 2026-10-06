import { createAnnualLicense } from "../billing/annual-license.js";
import type { AppliedLicensePayment, LicensePaymentApplicationRepository } from "../billing/license-payment-application-repository.js";
import type { LicenseRepository } from "../billing/license-repository.js";
export class MemoryLicensePaymentApplicationRepository implements LicensePaymentApplicationRepository {
  private readonly refs=new Map<string,AppliedLicensePayment>();
  constructor(private readonly licenses:LicenseRepository){}
  async apply(input:Parameters<LicensePaymentApplicationRepository["apply"]>[0]){
    const prior=this.refs.get(input.providerReference); if(prior) return structuredClone(prior);
    const existing=await this.licenses.getByUserIdAndPlan(input.userId,input.plan);
    const license=createAnnualLicense(input.userId,input.paidAt,input.plan,existing,input.licenseName);
    const result={applied:true,license}; this.refs.set(input.providerReference,structuredClone(result)); await this.licenses.save(license); return result;
  }
}
