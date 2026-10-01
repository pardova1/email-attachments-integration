import assert from "node:assert/strict";
import test from "node:test";
import { RecoveryAgentPool, type LabeledTransferIssue } from "../src/operations/recovery-agent-pool.js";

test("each simultaneous issue receives its own recovery assignment", async () => {
  const pool = new RecoveryAgentPool({ provision: async required => required });
  const issues: LabeledTransferIssue[] = Array.from({ length: 1000 }, (_, i) => ({
    issueId: `issue-${i}`,
    transferId: `transfer-${i}`,
    laneId: `lane-${i}`,
    label: "storage-problem",
    detectedAt: new Date()
  }));

  const assignments = await pool.assignImmediately(issues);
  assert.equal(assignments.length, 1000);
  assert.equal(new Set(assignments.map(a => a.agentId)).size, 1000);
  assert.equal(new Set(assignments.map(a => a.laneId)).size, 1000);
});

test("capacity shortfall is explicit and never silently drops issues", async () => {
  const pool = new RecoveryAgentPool({ provision: async required => required - 1 });
  await assert.rejects(() => pool.assignImmediately([{
    issueId: "one", transferId: "transfer-one", laneId: "lane-one",
    label: "storage-problem", detectedAt: new Date()
  }]), /RECOVERY_CAPACITY_SHORTFALL/);
});
