import { createAnnualLicense,priceForPlan } from "../billing/annual-license.js";
import type { LicensePaymentApplicationRepository } from "../billing/license-payment-application-repository.js";
import type { LicenseRepository } from "../billing/license-repository.js";
export class MemoryLicensePaymentApplicationRepository implements LicensePaymentApplicationRepository {
  private readonly refs=new Map<string,{userId:string;plan:string;amount:number;paidAt:number}>();
  private pending:Promise<void>=Promise.resolve();
  constructor(private readonly licenses:LicenseRepository){}
  async apply(input:Parameters<LicensePaymentApplicationRepository["apply"]>[0]){
    input=structuredClone(input);
    if(!input.providerReference?.trim()||!input.userId?.trim()||!["individual","business"].includes(input.plan)||input.amountPaidUsdCents!==priceForPlan(input.plan)||!Number.isFinite(input.paidAt.getTime()))throw new Error("INVALID_LICENSE_PAYMENT");
    const previous=this.pending;let release!:()=>void;
    this.pending=new Promise<void>(resolve=>{release=resolve;});
    await previous;
    try{
      const receipt={userId:input.userId,plan:input.plan,amount:input.amountPaidUsdCents,paidAt:input.paidAt.getTime()};
      const prior=this.refs.get(input.providerReference);
      if(prior&&JSON.stringify(prior)!==JSON.stringify(receipt))throw new Error("PAYMENT_REFERENCE_COLLISION");
      const existing=await this.licenses.getByUserIdAndPlan(input.userId,input.plan);
      if(prior){if(!existing)throw new Error("LICENSE_PAYMENT_APPLICATION_FAILED");return {applied:false,license:structuredClone(existing)};}
      const license=createAnnualLicense(input.userId,input.paidAt,input.plan,existing,input.licenseName??existing?.licenseName);
      // Failed saves never consume the payment receipt. Serialize this
      // development-only adapter so concurrent renewals cannot lose a term.
      await this.licenses.save(license);
      this.refs.set(input.providerReference,receipt);
      return {applied:true,license:structuredClone(license)};
    }finally{release();}
  }
}
