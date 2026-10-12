import type { CheckoutRequest, CheckoutResult, PaymentConfirmation, PaymentProvider } from "../billing/payment-provider.js";
import {StripePaymentProvider} from "../adapters/stripe-payment-provider.js";

class UnavailablePaymentProvider implements PaymentProvider {
  async createCheckout(_request: CheckoutRequest): Promise<CheckoutResult> { throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED"); }
  async verifyPayment(_providerReference: string): Promise<PaymentConfirmation> { throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED"); }
}

export function createPaymentProvider(env: NodeJS.ProcessEnv = process.env,request:typeof fetch=fetch): PaymentProvider {
  if(env.PAYMENT_PROVIDER!==undefined){
    if(env.PAYMENT_PROVIDER!=="stripe")throw new Error("UNSUPPORTED_PAYMENT_PROVIDER");
    const timeout=env.PAYMENT_PROVIDER_TIMEOUT_MS;
    if(timeout!==undefined&&!/^[0-9]+$/.test(timeout))throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED");
    if(env.NODE_ENV==="production"&&!env.STRIPE_SECRET_KEY?.startsWith("sk_live_"))throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED");
    return new StripePaymentProvider({secretKey:env.STRIPE_SECRET_KEY??"",successUrl:env.PAYMENT_SUCCESS_URL??"",cancelUrl:env.PAYMENT_CANCEL_URL??"",timeoutMs:timeout===undefined?undefined:Number(timeout)},request);
  }
  if (env.NODE_ENV === "production") throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED");
  return new UnavailablePaymentProvider();
}
