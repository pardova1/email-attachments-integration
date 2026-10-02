import type { ServicePlanId } from "./service-plans.js";

export type PlanEntitlement =
  | "large-file-send"
  | "verified-exact-delivery"
  | "automatic-recovery"
  | "team-administration"
  | "central-transfer-oversight"
  | "business-reporting"
  | "organization-policy-controls"
  | "audit-history";

const CORE: PlanEntitlement[] = [
  "large-file-send",
  "verified-exact-delivery",
  "automatic-recovery"
];

const BUSINESS: PlanEntitlement[] = [
  ...CORE,
  "team-administration",
  "central-transfer-oversight",
  "business-reporting",
  "organization-policy-controls",
  "audit-history"
];

export function entitlementsFor(plan: ServicePlanId): readonly PlanEntitlement[] {
  return plan === "business" ? BUSINESS : CORE;
}

export function hasEntitlement(plan: ServicePlanId, entitlement: PlanEntitlement) {
  return entitlementsFor(plan).includes(entitlement);
}
