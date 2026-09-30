import type { AnnualLicense } from "../billing/annual-license.js";
import type { LicenseRepository } from "../billing/license-repository.js";

export class MemoryLicenseRepository implements LicenseRepository {
  private readonly licenses = new Map<string, AnnualLicense>();

  async getByUserId(userId: string) {
    return this.licenses.get(userId) ?? null;
  }

  async save(license: AnnualLicense) {
    this.licenses.set(license.userId, license);
  }
}
