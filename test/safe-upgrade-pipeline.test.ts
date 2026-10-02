import assert from "node:assert/strict";
import test from "node:test";
import { SafeUpgradePipeline } from "../src/releases/safe-upgrade-pipeline.js";

test("validated improvement can be approved only when safeguards pass", () => {
  const stage = new SafeUpgradePipeline().evaluate({
    findingId: "f-1", area: "lane-routing", requiresTesting: true,
    mayModifyUserFileBytes: false, mayBypassSecurity: false, mayDisruptActiveTransfers: false
  }, {
    compatibilityPassed: true, exactIntegrityPassed: true,
    activeLaneIsolationPassed: true, securityPassed: true, performanceRegression: false
  });
  assert.equal(stage, "production-approved");
});

test("integrity failure forces rollback", () => {
  const stage = new SafeUpgradePipeline().evaluate({
    findingId: "f-2", area: "storage", requiresTesting: true,
    mayModifyUserFileBytes: false, mayBypassSecurity: false, mayDisruptActiveTransfers: false
  }, {
    compatibilityPassed: true, exactIntegrityPassed: false,
    activeLaneIsolationPassed: true, securityPassed: true, performanceRegression: false
  });
  assert.equal(stage, "rolled-back");
});
