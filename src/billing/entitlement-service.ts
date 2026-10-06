import { createAnnualLicense, isLicenseActive, planForAmount } from "./annual-license.js";
import type { LicenseRepository } from "./license-repository.js";
import type { PaymentProvider } from "./payment-provider.js";

export class EntitlementService {
  constructor(private readonly payments: PaymentProvider, private readonly licenses: LicenseRepository) {}

  async activateFromPayment(providerReference: string) {
    const payment = await this.payments.verifyPayment(providerReference);
    if (payment.status !== "paid") throw new Error("PAYMENT_NOT_COMPLETED");
    const plan = planForAmount(payment.amountUsdCents);
    const existing = await this.licenses.getByUserId(payment.userId);
    const license = createAnnualLicense(payment.userId, payment.paidAt, plan, existing);
    await this.licenses.save(license);
    return license;
  }

  async requireActive(userId: string, now = new Date()) {
    const license = await this.licenses.getByUserId(userId);
    if (!license || !isLicenseActive(license, now)) throw new Error("ACTIVE_LICENSE_REQUIRED");
    return license;
  }
}
