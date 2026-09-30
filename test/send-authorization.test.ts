import assert from "node:assert/strict";
import test from "node:test";
import { MemoryLicenseRepository } from "../src/adapters/memory-license-repository.js";
import { MemoryStorage } from "../src/adapters/memory-storage.js";
import { createAnnualLicense } from "../src/billing/annual-license.js";
import { EntitlementService } from "../src/billing/entitlement-service.js";
import type { PaymentProvider } from "../src/billing/payment-provider.js";
import { SendAuthorizationService } from "../src/services/send-authorization-service.js";
import { TransferService } from "../src/services/transfer-service.js";

const unusedPayments: PaymentProvider = {
  async createCheckout() { throw new Error("NOT_USED"); },
  async verifyPayment() { throw new Error("NOT_USED"); }
};

const input = {
  fileName: "large-video.mp4",
  contentType: "video/mp4",
  totalBytes: 1024,
  senderExpirationConfirmed: true as const
};

test("valid annual user can create a large-file transfer", async () => {
  const licenses = new MemoryLicenseRepository();
  await licenses.save(createAnnualLicense("valid-user", new Date("2026-09-30T00:00:00Z")));
  const entitlements = new EntitlementService(unusedPayments, licenses);
  const sends = new SendAuthorizationService(entitlements, new TransferService(new MemoryStorage()));

  const transfer = await sends.createForValidUser("valid-user", input, new Date("2026-10-01T00:00:00Z"));
  assert.ok(transfer.id);
});

test("unlicensed user cannot create a large-file transfer", async () => {
  const licenses = new MemoryLicenseRepository();
  const entitlements = new EntitlementService(unusedPayments, licenses);
  const sends = new SendAuthorizationService(entitlements, new TransferService(new MemoryStorage()));

  await assert.rejects(
    sends.createForValidUser("unlicensed-user", input, new Date("2026-10-01T00:00:00Z")),
    /ACTIVE_LICENSE_REQUIRED/
  );
});

test("expired user cannot create a large-file transfer", async () => {
  const licenses = new MemoryLicenseRepository();
  await licenses.save(createAnnualLicense("expired-user", new Date("2025-01-01T00:00:00Z")));
  const entitlements = new EntitlementService(unusedPayments, licenses);
  const sends = new SendAuthorizationService(entitlements, new TransferService(new MemoryStorage()));

  await assert.rejects(
    sends.createForValidUser("expired-user", input, new Date("2026-10-01T00:00:00Z")),
    /ACTIVE_LICENSE_REQUIRED/
  );
});
