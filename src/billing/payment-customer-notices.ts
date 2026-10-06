import type { AnnualLicense } from "./annual-license.js";
export function successfulPurchaseNotice(license:AnnualLicense){ return {subject:"Payment confirmed — license active",text:`Your payment was confirmed. Your ${license.plan} license is active through ${license.expiresAt.toISOString()}. Thank you for your purchase.`}; }
export function failedPaymentNotice(){ return {subject:"Payment not completed",text:"Your payment could not be confirmed, so no license was activated. Please review your payment information or payment-provider instructions and try again."}; }
