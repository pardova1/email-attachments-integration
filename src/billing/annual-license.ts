export const ANNUAL_LICENSE_USD_CENTS = 400;
export const LICENSE_TERM_DAYS = 365;

export interface AnnualLicense {
  userId: string;
  startsAt: Date;
  expiresAt: Date;
  amountPaidUsdCents: number;
  status: "active" | "expired";
}

export function createAnnualLicense(userId: string, paidAt = new Date()): AnnualLicense {
  const expiresAt = new Date(paidAt.getTime() + LICENSE_TERM_DAYS * 24 * 60 * 60 * 1000);
  return {
    userId,
    startsAt: paidAt,
    expiresAt,
    amountPaidUsdCents: ANNUAL_LICENSE_USD_CENTS,
    status: "active"
  };
}

export function isLicenseActive(license: AnnualLicense, now = new Date()) {
  return license.status === "active" && now.getTime() < license.expiresAt.getTime();
}
