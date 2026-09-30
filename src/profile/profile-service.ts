import type { LicenseRepository } from "../billing/license-repository.js";
import { buildServiceStatus } from "./service-status.js";

export class ProfileService {
  constructor(private readonly licenses: LicenseRepository) {}

  async getServiceStatus(userId: string, now = new Date()) {
    const license = await this.licenses.getByUserId(userId);
    if (!license) {
      return {
        userStatus: "Renewal Required" as const,
        indicator: "red" as const,
        purchaseDate: null,
        nextRenewalDate: null,
        note: "Please renew your service." as const
      };
    }
    return buildServiceStatus(license, now);
  }
}
