export interface CheckoutRequest {
  userId: string;
  amountUsdCents: 400;
  product: "annual-license";
}

export interface CheckoutResult {
  checkoutId: string;
  providerReference: string;
}

export interface PaymentConfirmation {
  userId: string;
  amountUsdCents: number;
  paidAt: Date;
  providerReference: string;
  status: "paid" | "failed" | "refunded";
}

export interface PaymentProvider {
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  verifyPayment(providerReference: string): Promise<PaymentConfirmation>;
}
