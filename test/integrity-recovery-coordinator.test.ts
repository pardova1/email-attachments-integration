import assert from "node:assert/strict";
import test from "node:test";
import { IntegrityViolationRegistry } from "../src/integrity/violation-registry.js";
import { IntegrityRecoveryCoordinator } from "../src/integrity/integrity-recovery-coordinator.js";
import { OperationsRecoveryAgent } from "../src/operations/recovery-agent.js";

test("integrity violation is labeled and queued for backend verification recovery", () => {
  const registry = new IntegrityViolationRegistry();
  const violation = registry.report({
    transferId: "t1",
    type: "INTEGRITY-WHOLE-FILE-MISMATCH",
    expectedSha256: "a".repeat(64),
    receivedSha256: "b".repeat(64),
    details: "Mismatch"
  });
  const coordinator = new IntegrityRecoveryCoordinator(registry, new OperationsRecoveryAgent());
  const plan = coordinator.plan(violation.violationId);
  assert.equal(plan.violationId, violation.violationId);
  assert.equal(plan.decision.action, "verify-integrity");
  assert.equal(plan.resolution, "Retrying");
  assert.equal(registry.get(violation.violationId)?.retryCount, 1);
});

test("expired transfer does not bypass expiration during recovery", () => {
  const registry = new IntegrityViolationRegistry();
  const violation = registry.report({ transferId: "t1", type: "INTEGRITY-CHUNK-MISMATCH", details: "Mismatch" });
  const coordinator = new IntegrityRecoveryCoordinator(registry, new OperationsRecoveryAgent());
  const plan = coordinator.plan(violation.violationId, true);
  assert.equal(plan.decision.action, "escalate");
  assert.equal(plan.resolution, "Needs Attention");
});
