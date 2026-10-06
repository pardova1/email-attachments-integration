import type { AnnualLicense, LicensePlan } from "../billing/annual-license.js";
import type { LicenseRepository } from "../billing/license-repository.js";
export class MemoryLicenseRepository implements LicenseRepository {
  private readonly licenses=new Map<string,AnnualLicense>();
  private key(userId:string,plan:LicensePlan){return `${userId}:${plan}`;}
  async getByUserId(userId:string){return (await this.listByUserId(userId))[0]??null;}
  async getByUserIdAndPlan(userId:string,plan:LicensePlan){return this.licenses.get(this.key(userId,plan))??null;}
  async listByUserId(userId:string){return [...this.licenses.values()].filter(x=>x.userId===userId);}
  async save(license:AnnualLicense){this.licenses.set(this.key(license.userId,license.plan),license);}
}
