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
  originalSha256: "a".repeat(64),
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
test("license expiry between read and final creation check prevents any transfer",async()=>{
 const licenses=new MemoryLicenseRepository(),license=createAnnualLicense("a",new Date("2026-10-13T00:00:00Z"));await licenses.save(license);let now=new Date(license.expiresAt.getTime()-1),creates=0;
 const transfers=new TransferService(new MemoryStorage()),create=transfers.createDurable.bind(transfers);transfers.createDurable=async value=>{creates++;return create(value);};
 const sends=new SendAuthorizationService(new EntitlementService(unusedPayments,licenses),transfers);
 await assert.rejects(sends.createForValidUser("a",input,()=>now,()=>{now=license.expiresAt;}),/ACTIVE_LICENSE_REQUIRED/);assert.equal(creates,0);
});
test("future-start license cannot create a transfer and valid business licensing still can",async()=>{
 const licenses=new MemoryLicenseRepository(),license=createAnnualLicense("a",new Date("2026-10-13T00:00:00Z"),"business");await licenses.save(license);
 const sends=new SendAuthorizationService(new EntitlementService(unusedPayments,licenses),new TransferService(new MemoryStorage()));
 await assert.rejects(sends.createForValidUser("a",input,new Date(license.startsAt.getTime()-1)),/ACTIVE_LICENSE_REQUIRED/);
 assert.ok((await sends.createForValidUser("a",input,()=>license.startsAt)).id);
});
