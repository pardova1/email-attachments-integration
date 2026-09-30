import assert from "node:assert/strict";
import test from "node:test";
import { IntegrityViolationRegistry } from "../src/integrity/violation-registry.js";

test("integrity violations receive searchable labels and IDs", () => {
  const registry = new IntegrityViolationRegistry();
  const v = registry.report({
    transferId: "t1",
    type: "INTEGRITY-WHOLE-FILE-MISMATCH",
    expectedSha256: "a".repeat(64),
    receivedSha256: "b".repeat(64),
    details: "Completed bytes do not match sender original."
  });
  assert.match(v.violationId, /^IV-/);
  assert.equal(v.resolution, "Needs Attention");
  assert.equal(registry.forTransfer("t1")[0]?.type, "INTEGRITY-WHOLE-FILE-MISMATCH");
  registry.markRetrying(v.violationId);
  assert.equal(registry.get(v.violationId)?.retryCount, 1);
  registry.markCorrected(v.violationId);
  assert.equal(registry.get(v.violationId)?.resolution, "Corrected");
});
