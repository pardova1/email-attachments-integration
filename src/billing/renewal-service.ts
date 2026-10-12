import { planForAmount } from "./annual-license.js";
import type {LicensePaymentApplicationRepository} from "./license-payment-application-repository.js";
import type { LicenseRepository } from "./license-repository.js";
import type { PaymentProvider } from "./payment-provider.js";

export class RenewalService {
  constructor(private readonly payments: PaymentProvider, private readonly licenses: LicenseRepository,private readonly applications?:LicensePaymentApplicationRepository) {}

  async renew(providerReference: string) {
    const payment = await this.payments.verifyPayment(providerReference);
    if (payment.status !== "paid") throw new Error("PAYMENT_NOT_COMPLETED");
    if(payment.providerReference!==providerReference)throw new Error("PAYMENT_REFERENCE_MISMATCH");
    const plan = planForAmount(payment.amountUsdCents);
    const current = await this.licenses.getByUserIdAndPlan(payment.userId, plan);
    if (!current) throw new Error("LICENSE_TO_RENEW_NOT_FOUND");
    if(!this.applications)throw new Error("PAYMENT_IDEMPOTENCY_NOT_CONFIGURED");
    return (await this.applications.apply({providerReference,userId:payment.userId,plan,amountPaidUsdCents:payment.amountUsdCents,paidAt:payment.paidAt})).license;
  }
}
