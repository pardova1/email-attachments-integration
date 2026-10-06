import type { AnnualLicense, LicensePlan } from "./annual-license.js";
export interface AppliedLicensePayment { applied:boolean; license:AnnualLicense; }
export interface LicensePaymentApplicationRepository {
  apply(input:{providerReference:string;userId:string;plan:LicensePlan;licenseName?:string;amountPaidUsdCents:number;paidAt:Date}):Promise<AppliedLicensePayment>;
}
