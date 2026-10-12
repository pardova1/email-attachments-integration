import assert from "node:assert/strict";
import test from "node:test";
import { MemoryLicensePaymentApplicationRepository } from "../src/adapters/memory-license-payment-application-repository.js";
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
  const renewed = await new RenewalService(payments, licenses,new MemoryLicensePaymentApplicationRepository(licenses)).renew("p");
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
  const renewed = await new RenewalService(payments, licenses,new MemoryLicensePaymentApplicationRepository(licenses)).renew("p");
  assert.equal(renewed.expiresAt.getTime(), paidAt.getTime() + 365 * 24 * 60 * 60 * 1000);
});

const term=365*24*60*60*1000;
async function renewalFixture(){
 const licenses=new MemoryLicenseRepository(),existing=createAnnualLicense("u1",new Date("2026-09-30T00:00:00Z"));await licenses.save(existing);
 const applications=new MemoryLicensePaymentApplicationRepository(licenses);
 const payments:PaymentProvider={async createCheckout(){throw new Error("UNUSED");},async verifyPayment(providerReference){return {userId:"u1",amountUsdCents:400,paidAt:new Date("2027-09-01T00:00:00Z"),providerReference,status:"paid"};}};
 return {licenses,existing,applications,payments,service:new RenewalService(payments,licenses,applications)};
}
test("repeated and simultaneous renewal callbacks add only one term per payment",async()=>{
 const f=await renewalFixture();const replies=await Promise.all(Array.from({length:8},()=>f.service.renew("p")));
 assert.ok(replies.every(reply=>reply.expiresAt.getTime()===f.existing.expiresAt.getTime()+term));
 const replay=await f.service.renew("p");assert.equal(replay.expiresAt.getTime(),f.existing.expiresAt.getTime()+term);
});
test("distinct simultaneous payments each add one term and old replay returns current license",async()=>{
 const f=await renewalFixture();await Promise.all([f.service.renew("a"),f.service.renew("b")]);
 assert.equal((await f.service.renew("a")).expiresAt.getTime(),f.existing.expiresAt.getTime()+2*term);
});
test("failed license save leaves payment retryable",async()=>{
 const f=await renewalFixture(),save=f.licenses.save.bind(f.licenses);let fail=true;
 f.licenses.save=async value=>{if(fail){fail=false;throw new Error("SAVE_UNAVAILABLE");}await save(value);};
 await assert.rejects(f.service.renew("p"),/SAVE_UNAVAILABLE/);assert.equal((await f.service.renew("p")).expiresAt.getTime(),f.existing.expiresAt.getTime()+term);
});
test("renewal requires shared payment application protection and matching verified reference",async()=>{
 const f=await renewalFixture();await assert.rejects(new RenewalService(f.payments,f.licenses).renew("p"),/PAYMENT_IDEMPOTENCY_NOT_CONFIGURED/);
 await assert.rejects(new RenewalService({...f.payments,async verifyPayment(){return {...await f.payments.verifyPayment("other")};}},f.licenses,f.applications).renew("p"),/PAYMENT_REFERENCE_MISMATCH/);
 assert.equal((await f.licenses.getByUserId("u1"))!.expiresAt.getTime(),f.existing.expiresAt.getTime());
});
test("payment references cannot be reused for different identities amounts or dates",async()=>{
 const f=await renewalFixture(),input={providerReference:"p",userId:"u1",plan:"individual" as const,amountPaidUsdCents:400,paidAt:new Date("2027-09-01T00:00:00Z")};await f.applications.apply(input);
 for(const changed of [{userId:"u2"},{plan:"business" as const,amountPaidUsdCents:1000},{paidAt:new Date("2027-09-02T00:00:00Z")}])await assert.rejects(f.applications.apply({...input,...changed}),/PAYMENT_REFERENCE_COLLISION/);
 await assert.rejects(f.applications.apply({...input,amountPaidUsdCents:1}),/INVALID_LICENSE_PAYMENT/);
});
