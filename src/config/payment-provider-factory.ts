import type { PaymentProvider } from "../billing/payment-provider.js";

class UnavailablePaymentProvider implements PaymentProvider {
  async createCheckout() { throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED"); }
  async verifyPayment() { throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED"); }
}

export function createPaymentProvider(env: NodeJS.ProcessEnv = process.env): PaymentProvider {
  if (env.NODE_ENV === "production") throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED");
  return new UnavailablePaymentProvider();
}
