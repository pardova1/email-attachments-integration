import { ANNUAL_LICENSE_USD_CENTS, LICENSE_TERM_DAYS, type AnnualLicense } from "./annual-license.js";
import type { LicenseRepository } from "./license-repository.js";
import type { PaymentProvider } from "./payment-provider.js";

const YEAR_MS = LICENSE_TERM_DAYS * 24 * 60 * 60 * 1000;

export class RenewalService {
  constructor(private readonly payments: PaymentProvider, private readonly licenses: LicenseRepository) {}

  async renew(providerReference: string) {
    const payment = await this.payments.verifyPayment(providerReference);
    if (payment.status !== "paid") throw new Error("PAYMENT_NOT_COMPLETED");
    if (payment.amountUsdCents !== ANNUAL_LICENSE_USD_CENTS) throw new Error("INVALID_LICENSE_AMOUNT");

    const current = await this.licenses.getByUserId(payment.userId);
    const base = current && current.expiresAt.getTime() > payment.paidAt.getTime()
      ? current.expiresAt
      : payment.paidAt;

    const renewed: AnnualLicense = {
      userId: payment.userId,
      startsAt: payment.paidAt,
      expiresAt: new Date(base.getTime() + YEAR_MS),
      amountPaidUsdCents: ANNUAL_LICENSE_USD_CENTS,
      status: "active"
    };
    await this.licenses.save(renewed);
    return renewed;
  }
}
