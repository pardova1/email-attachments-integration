import assert from "node:assert/strict";
import test from "node:test";
import { RenewalService } from "../src/billing/renewal-service.js";
import { MemoryLicenseRepository } from "../src/adapters/memory-license-repository.js";
import { createAnnualLicense } from "../src/billing/annual-license.js";
import type { PaymentProvider } from "../src/billing/payment-provider.js";

test("early renewal adds a year after the existing renewal date", async () => {
  const licenses = new MemoryLicenseRepository();
  const existing = createAnnualLicense("u1", new Date("2026-09-30T00:00:00Z"));
  await licenses.save(existing);
  const payments: PaymentProvider = {
    async createCheckout() { return { checkoutId: "c", providerReference: "p" }; },
    async verifyPayment() { return { userId: "u1", amountUsdCents: 400, paidAt: new Date("2027-09-01T00:00:00Z"), providerReference: "p", status: "paid" }; }
  };
  const renewed = await new RenewalService(payments, licenses).renew("p");
  assert.equal(renewed.expiresAt.getTime(), existing.expiresAt.getTime() + 365 * 24 * 60 * 60 * 1000);
});

test("expired renewal starts a new year from verified payment date", async () => {
  const licenses = new MemoryLicenseRepository();
  await licenses.save(createAnnualLicense("u1", new Date("2025-01-01T00:00:00Z")));
  const paidAt = new Date("2027-01-10T00:00:00Z");
  const payments: PaymentProvider = {
    async createCheckout() { return { checkoutId: "c", providerReference: "p" }; },
    async verifyPayment() { return { userId: "u1", amountUsdCents: 400, paidAt, providerReference: "p", status: "paid" }; }
  };
  const renewed = await new RenewalService(payments, licenses).renew("p");
  assert.equal(renewed.expiresAt.getTime(), paidAt.getTime() + 365 * 24 * 60 * 60 * 1000);
});
