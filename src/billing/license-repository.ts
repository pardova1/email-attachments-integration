import type { AnnualLicense } from "./annual-license.js";

export interface LicenseRepository {
  getByUserId(userId: string): Promise<AnnualLicense | null>;
  save(license: AnnualLicense): Promise<void>;
}
