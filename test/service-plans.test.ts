import assert from "node:assert/strict";
import test from "node:test";
import { servicePlan } from "../src/billing/service-plans.js";

test("individual annual service costs four dollars", () => {
  const plan = servicePlan("individual");
  assert.equal(plan.annualPriceUsdCents,400);
  assert.equal(plan.termDays,365);
});

test("business annual service costs ten dollars and enables expanded business functions", () => {
  const plan = servicePlan("business");
  assert.equal(plan.annualPriceUsdCents,1000);
  assert.equal(plan.expandedBusinessFunctions,true);
  assert.equal(plan.termDays,365);
});
