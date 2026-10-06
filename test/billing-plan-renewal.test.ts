import assert from "node:assert/strict";
import test from "node:test";
import {
  BUSINESS_ANNUAL_LICENSE_USD_CENTS, INDIVIDUAL_ANNUAL_LICENSE_USD_CENTS,
  createAnnualLicense, planForAmount
} from "../src/billing/annual-license.js";

test("individual annual plan costs exactly four US dollars", () => {
  assert.equal(INDIVIDUAL_ANNUAL_LICENSE_USD_CENTS, 400);
});
test("business annual plan costs exactly ten US dollars", () => {
  assert.equal(BUSINESS_ANNUAL_LICENSE_USD_CENTS, 1000);
});
test("supported paid amounts resolve to the correct plan", () => {
  assert.equal(planForAmount(400),"individual"); assert.equal(planForAmount(1000),"business");
  assert.throws(()=>planForAmount(500),/INVALID_LICENSE_AMOUNT/);
});
test("early renewal preserves remaining paid time", () => {
  const start=new Date("2026-01-01T00:00:00Z");
  const first=createAnnualLicense("u1",start,"individual");
  const renewed=createAnnualLicense("u1",new Date("2026-06-01T00:00:00Z"),"individual",first);
  assert.equal(renewed.startsAt.toISOString(),first.startsAt.toISOString());
  assert.equal(renewed.expiresAt.getTime(),first.expiresAt.getTime()+365*24*60*60*1000);
});
test("individual and business are independent licenses and may both be valid", () => {
  const paidAt=new Date("2026-01-01T00:00:00Z");
  const individual=createAnnualLicense("u1",paidAt,"individual",null,"John");
  const business=createAnnualLicense("u1",paidAt,"business",null,"Example Business");
  assert.equal(individual.plan,"individual");
  assert.equal(individual.licenseName,"John");
  assert.equal(individual.amountPaidUsdCents,400);
  assert.equal(business.plan,"business");
  assert.equal(business.licenseName,"Example Business");
  assert.equal(business.amountPaidUsdCents,1000);
});

test("renewing one license does not consume the other license term", () => {
  const paidAt=new Date("2026-01-01T00:00:00Z");
  const individual=createAnnualLicense("u1",paidAt,"individual",null,"John");
  const business=createAnnualLicense("u1",paidAt,"business",null,"Example Business");
  const renewedIndividual=createAnnualLicense("u1",new Date("2026-06-01T00:00:00Z"),"individual",individual);
  assert.equal(renewedIndividual.expiresAt.getTime(),individual.expiresAt.getTime()+365*24*60*60*1000);
  assert.equal(business.expiresAt.toISOString(),createAnnualLicense("u1",paidAt,"business").expiresAt.toISOString());
});
