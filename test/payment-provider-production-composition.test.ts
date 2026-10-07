import assert from "node:assert/strict";
import test from "node:test";
import { createPaymentProvider } from "../src/config/payment-provider-factory.js";

test("development payment provider remains explicitly unavailable", async () => {
  const provider = createPaymentProvider({ NODE_ENV: "development" });
  await assert.rejects(() => provider.verifyPayment("test"), /PAYMENT_PROVIDER_NOT_CONFIGURED/);
});

test("production payment composition fails closed without a selected provider", () => {
  assert.throws(() => createPaymentProvider({ NODE_ENV: "production" }), /PAYMENT_PROVIDER_NOT_CONFIGURED/);
});
