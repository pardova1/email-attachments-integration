import assert from "node:assert/strict";
import test from "node:test";
import { OperationsRecoveryAgent } from "../src/operations/recovery-agent.js";

test("retries transient failures automatically", () => {
  const agent = new OperationsRecoveryAgent();
  const decision = agent.diagnose({
    transferId: "t1",
    kind: "network",
    attempt: 1,
    transferExpired: false
  });
  assert.equal(decision.action, "retry-part");
});

test("never bypasses the expiration policy", () => {
  const agent = new OperationsRecoveryAgent();
  const decision = agent.diagnose({
    transferId: "t1",
    kind: "network",
    attempt: 1,
    transferExpired: true
  });
  assert.equal(decision.action, "escalate");
});

test("escalates after automatic repair limit", () => {
  const agent = new OperationsRecoveryAgent(5);
  const decision = agent.diagnose({
    transferId: "t1",
    kind: "timeout",
    attempt: 5,
    transferExpired: false
  });
  assert.equal(decision.action, "escalate");
});
