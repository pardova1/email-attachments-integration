import assert from "node:assert/strict";
import test from "node:test";
import { EntitlementService } from "../src/billing/entitlement-service.js";
import { MemoryLicenseRepository } from "../src/adapters/memory-license-repository.js";
import type { PaymentProvider } from "../src/billing/payment-provider.js";
import { MemoryLicensePaymentApplicationRepository } from "../src/adapters/memory-license-payment-application-repository.js";

test("verified four-dollar payment activates annual entitlement", async () => {
  const payments: PaymentProvider = {
    async createCheckout() { return { checkoutId: "c1", providerReference: "p1" }; },
    async verifyPayment() {
      return { userId: "u1", amountUsdCents: 400, paidAt: new Date("2026-01-01T00:00:00Z"), providerReference: "p1", status: "paid" };
    }
  };
  const licenses = new MemoryLicenseRepository();
  const service = new EntitlementService(payments, licenses, new MemoryLicensePaymentApplicationRepository(licenses));
  const license = await service.activateFromPayment("p1");
  assert.equal(license.amountPaidUsdCents, 400);
  assert.equal((await service.requireActive("u1", new Date("2026-06-01T00:00:00Z"))).userId, "u1");
  const duplicate = await service.activateFromPayment("p1");
  assert.equal(duplicate.expiresAt.toISOString(), license.expiresAt.toISOString());
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
test("license status reads both customer plans without verifying or applying payment",async()=>{
 const {createAnnualLicense}=await import("../src/billing/annual-license.js"),licenses=new MemoryLicenseRepository();let paymentsCalled=0;
 const payments={async createCheckout(){paymentsCalled++;throw new Error("UNUSED");},async verifyPayment(){paymentsCalled++;throw new Error("UNUSED");}};
 const individual=createAnnualLicense("a",new Date("2025-01-01T00:00:00Z")),business=createAnnualLicense("a",new Date("2026-09-01T00:00:00Z"),"business");await licenses.save(individual);await licenses.save(business);await licenses.save(createAnnualLicense("b"));
 const service=new EntitlementService(payments,licenses),at=new Date("2026-10-13T00:00:00Z"),result=await service.licenseStatus("a",at);
 assert.equal(result.checkedAt,at.toISOString());assert.deepEqual(result.licenses.map(x=>[x.plan,x.active]),[["business",true],["individual",false]]);assert.equal(result.licenses.every(x=>!("userId" in x)&&!("licenseName" in x)),true);assert.equal(individual.status,"active");assert.equal(paymentsCalled,0);assert.deepEqual((await service.licenseStatus("missing",at)).licenses,[]);
});
test("future starts explicit expiration foreign rows duplicates and malformed license state fail safely",async()=>{
 const {createAnnualLicense}=await import("../src/billing/annual-license.js"),base=createAnnualLicense("a",new Date("2026-10-13T00:00:00Z")),at=new Date("2026-10-12T00:00:00Z"),licenses=new MemoryLicenseRepository(),payments={async createCheckout(){throw new Error("UNUSED");},async verifyPayment(){throw new Error("UNUSED");}};
 await licenses.save(base);const service=new EntitlementService(payments,licenses);assert.equal((await service.licenseStatus("a",at)).licenses[0].active,false);
 base.status="expired";assert.equal((await service.licenseStatus("a",new Date("2026-11-01T00:00:00Z"))).licenses[0].active,false);
 for(const rows of [[{...base,userId:"b"}],[base,base],[{...base,amountPaidUsdCents:1}],[{...base,startsAt:new Date("invalid")}],[{...base,expiresAt:base.startsAt}]]){licenses.listByUserId=async()=>rows;await assert.rejects(service.licenseStatus("a",at));}
});
