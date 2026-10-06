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
test("active plan cannot silently change during renewal", () => {
  const first=createAnnualLicense("u1",new Date("2026-01-01T00:00:00Z"),"individual");
  assert.throws(()=>createAnnualLicense("u1",new Date("2026-06-01T00:00:00Z"),"business",first),/LICENSE_PLAN_CHANGE_REQUIRES_SEPARATE_FLOW/);
});
