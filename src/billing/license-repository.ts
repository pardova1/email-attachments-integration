import type { AnnualLicense, LicensePlan } from "./annual-license.js";
export interface LicenseRepository {
  getByUserId(userId:string):Promise<AnnualLicense|null>;
  getByUserIdAndPlan(userId:string,plan:LicensePlan):Promise<AnnualLicense|null>;
  listByUserId(userId:string):Promise<AnnualLicense[]>;
  save(license:AnnualLicense):Promise<void>;
}
