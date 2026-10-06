export const INDIVIDUAL_ANNUAL_LICENSE_USD_CENTS = 400;
export const BUSINESS_ANNUAL_LICENSE_USD_CENTS = 1000;
export const ANNUAL_LICENSE_USD_CENTS = INDIVIDUAL_ANNUAL_LICENSE_USD_CENTS;
export const LICENSE_TERM_DAYS = 365;
export type LicensePlan = "individual" | "business";

export interface AnnualLicense {
  userId: string;
  plan: LicensePlan;
  licenseName: string;
  startsAt: Date;
  expiresAt: Date;
  amountPaidUsdCents: number;
  status: "active" | "expired";
}
export function priceForPlan(plan: LicensePlan) { return plan === "business" ? 1000 : 400; }
export function planForAmount(amountUsdCents: number): LicensePlan {
  if (amountUsdCents===400) return "individual"; if(amountUsdCents===1000) return "business"; throw new Error("INVALID_LICENSE_AMOUNT");
}
export function createAnnualLicense(userId:string, paidAt=new Date(), plan:LicensePlan="individual", existing?:AnnualLicense|null, licenseName?:string):AnnualLicense {
  const activeExisting=existing && existing.plan===plan && isLicenseActive(existing,paidAt) ? existing : null;
  const termBase=activeExisting ? activeExisting.expiresAt : paidAt;
  return {
    userId, plan, licenseName: licenseName ?? activeExisting?.licenseName ?? (plan==="business" ? "Business" : "Individual"),
    startsAt: activeExisting?.startsAt ?? paidAt,
    expiresAt:new Date(termBase.getTime()+LICENSE_TERM_DAYS*24*60*60*1000),
    amountPaidUsdCents:priceForPlan(plan), status:"active"
  };
}
export function isLicenseActive(license:AnnualLicense,now=new Date()){return license.status==="active"&&now.getTime()<license.expiresAt.getTime();}
