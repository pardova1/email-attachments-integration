export type FinancialHealth = "healthy" | "repair-required";
export interface FinancialCheck { paymentVerified:boolean; licenseActivated:boolean; idempotencyConfirmed:boolean; billingCompatible:boolean; entitlementCompatible:boolean; notificationCompatible:boolean; }
export interface FinancialAssessment { health:FinancialHealth; allowEntitlement:boolean; action:"confirm-purchase"|"notify-payment-failure"|"analyze-and-repair"; issues:string[]; }
export class FinancialOperationsComplianceAgent {
  assess(c:FinancialCheck):FinancialAssessment {
    const issues:string[]=[];
    if(!c.paymentVerified) issues.push("PAYMENT_NOT_VERIFIED");
    if(c.paymentVerified&&!c.licenseActivated) issues.push("LICENSE_NOT_ACTIVATED");
    if(!c.idempotencyConfirmed) issues.push("PAYMENT_IDEMPOTENCY_UNCONFIRMED");
    if(!c.billingCompatible) issues.push("BILLING_INCOMPATIBLE");
    if(!c.entitlementCompatible) issues.push("ENTITLEMENT_INCOMPATIBLE");
    if(!c.notificationCompatible) issues.push("NOTIFICATION_INCOMPATIBLE");
    if(!c.paymentVerified) return {health:"repair-required",allowEntitlement:false,action:"notify-payment-failure",issues};
    if(issues.length) return {health:"repair-required",allowEntitlement:false,action:"analyze-and-repair",issues};
    return {health:"healthy",allowEntitlement:true,action:"confirm-purchase",issues:[]};
  }
}
