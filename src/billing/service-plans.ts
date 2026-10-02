export type ServicePlanId = "individual" | "business";

export interface ServicePlan {
  id: ServicePlanId;
  name: string;
  annualPriceUsdCents: number;
  termDays: 365;
  audience: "non-business-individual" | "business";
  expandedBusinessFunctions: boolean;
}

export const SERVICE_PLANS: Record<ServicePlanId, ServicePlan> = {
  individual: {
    id: "individual",
    name: "Individual",
    annualPriceUsdCents: 400,
    termDays: 365,
    audience: "non-business-individual",
    expandedBusinessFunctions: false
  },
  business: {
    id: "business",
    name: "Business",
    annualPriceUsdCents: 1000,
    termDays: 365,
    audience: "business",
    expandedBusinessFunctions: true
  }
};

export function servicePlan(id: ServicePlanId) {
  return SERVICE_PLANS[id];
}
