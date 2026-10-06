import { createAnnualLicense, planForAmount } from "./annual-license.js";
import type { LicenseRepository } from "./license-repository.js";
import type { PaymentProvider } from "./payment-provider.js";

export class RenewalService {
  constructor(private readonly payments: PaymentProvider, private readonly licenses: LicenseRepository) {}

  async renew(providerReference: string) {
    const payment = await this.payments.verifyPayment(providerReference);
    if (payment.status !== "paid") throw new Error("PAYMENT_NOT_COMPLETED");
    const plan = planForAmount(payment.amountUsdCents);
    const current = await this.licenses.getByUserIdAndPlan(payment.userId, plan);
    if (!current) throw new Error("LICENSE_TO_RENEW_NOT_FOUND");
    const renewed = createAnnualLicense(payment.userId, payment.paidAt, plan, current, current.licenseName);
    await this.licenses.save(renewed);
    return renewed;
  }
}
