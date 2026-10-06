export const INDIVIDUAL_ANNUAL_LICENSE_USD_CENTS = 400;
export const BUSINESS_ANNUAL_LICENSE_USD_CENTS = 1000;
/** @deprecated Use INDIVIDUAL_ANNUAL_LICENSE_USD_CENTS. */
export const ANNUAL_LICENSE_USD_CENTS = INDIVIDUAL_ANNUAL_LICENSE_USD_CENTS;
export const LICENSE_TERM_DAYS = 365;
export type LicensePlan = "individual" | "business";

export interface AnnualLicense {
  userId: string;
  plan: LicensePlan;
  startsAt: Date;
  expiresAt: Date;
  amountPaidUsdCents: number;
  status: "active" | "expired";
}

export function priceForPlan(plan: LicensePlan) {
  return plan === "business" ? BUSINESS_ANNUAL_LICENSE_USD_CENTS : INDIVIDUAL_ANNUAL_LICENSE_USD_CENTS;
}

export function planForAmount(amountUsdCents: number): LicensePlan {
  if (amountUsdCents === INDIVIDUAL_ANNUAL_LICENSE_USD_CENTS) return "individual";
  if (amountUsdCents === BUSINESS_ANNUAL_LICENSE_USD_CENTS) return "business";
  throw new Error("INVALID_LICENSE_AMOUNT");
}

export function createAnnualLicense(userId: string, paidAt = new Date(), plan: LicensePlan = "individual", existing?: AnnualLicense | null): AnnualLicense {
  const activeExisting = existing && isLicenseActive(existing, paidAt) ? existing : null;
  if (activeExisting && activeExisting.plan !== plan) throw new Error("LICENSE_PLAN_CHANGE_REQUIRES_SEPARATE_FLOW");
  const termBase = activeExisting ? activeExisting.expiresAt : paidAt;
  const expiresAt = new Date(termBase.getTime() + LICENSE_TERM_DAYS * 24 * 60 * 60 * 1000);
  return { userId, plan, startsAt: activeExisting?.startsAt ?? paidAt, expiresAt, amountPaidUsdCents: priceForPlan(plan), status: "active" };
}

export function isLicenseActive(license: AnnualLicense, now = new Date()) {
  return license.status === "active" && now.getTime() < license.expiresAt.getTime();
}
