import type { AnnualLicense } from "../billing/annual-license.js";
import { isLicenseActive } from "../billing/annual-license.js";

export interface ServiceStatusView {
  userStatus: "Valid" | "Renewal Required";
  indicator: "green" | "red";
  purchaseDate: Date;
  nextRenewalDate: Date;
  note?: "Please renew your service.";
}

export function buildServiceStatus(license: AnnualLicense, now = new Date()): ServiceStatusView {
  const active = isLicenseActive(license, now);
  return {
    userStatus: active ? "Valid" : "Renewal Required",
    indicator: active ? "green" : "red",
    purchaseDate: license.startsAt,
    nextRenewalDate: license.expiresAt,
    ...(active ? {} : { note: "Please renew your service." as const })
  };
}
