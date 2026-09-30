import assert from "node:assert/strict";
import test from "node:test";
import { EntitlementService } from "../src/billing/entitlement-service.js";
import { MemoryLicenseRepository } from "../src/adapters/memory-license-repository.js";
import type { PaymentProvider } from "../src/billing/payment-provider.js";

test("verified four-dollar payment activates annual entitlement", async () => {
  const payments: PaymentProvider = {
    async createCheckout() { return { checkoutId: "c1", providerReference: "p1" }; },
    async verifyPayment() {
      return { userId: "u1", amountUsdCents: 400, paidAt: new Date("2026-01-01T00:00:00Z"), providerReference: "p1", status: "paid" };
    }
  };
  const service = new EntitlementService(payments, new MemoryLicenseRepository());
  const license = await service.activateFromPayment("p1");
  assert.equal(license.amountPaidUsdCents, 400);
  assert.equal((await service.requireActive("u1", new Date("2026-06-01T00:00:00Z"))).userId, "u1");
});

test("wrong payment amount cannot activate entitlement", async () => {
  const payments: PaymentProvider = {
    async createCheckout() { return { checkoutId: "c1", providerReference: "p1" }; },
    async verifyPayment() {
      return { userId: "u1", amountUsdCents: 399, paidAt: new Date(), providerReference: "p1", status: "paid" };
    }
  };
  const service = new EntitlementService(payments, new MemoryLicenseRepository());
  await assert.rejects(() => service.activateFromPayment("p1"), /INVALID_LICENSE_AMOUNT/);
});
