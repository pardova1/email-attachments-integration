import assert from "node:assert/strict";
import test from "node:test";
import { hasEntitlement } from "../src/billing/plan-entitlements.js";

test("both plans preserve core transfer and integrity functions", () => {
  for (const plan of ["individual","business"] as const) {
    assert.equal(hasEntitlement(plan,"large-file-send"),true);
    assert.equal(hasEntitlement(plan,"verified-exact-delivery"),true);
    assert.equal(hasEntitlement(plan,"automatic-recovery"),true);
  }
});

test("business plan enables organization functions", () => {
  assert.equal(hasEntitlement("business","team-administration"),true);
  assert.equal(hasEntitlement("business","central-transfer-oversight"),true);
  assert.equal(hasEntitlement("business","business-reporting"),true);
  assert.equal(hasEntitlement("business","organization-policy-controls"),true);
  assert.equal(hasEntitlement("business","audit-history"),true);
  assert.equal(hasEntitlement("individual","team-administration"),false);
});
