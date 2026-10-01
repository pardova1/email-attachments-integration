import assert from "node:assert/strict";
import test from "node:test";
import { createTransferLane } from "../src/scaling/transfer-lane.js";
import { StorageDirectorAgent, type StorageArea } from "../src/storage/storage-director-agent.js";
import { StorageRecoveryCoordinator } from "../src/storage/storage-recovery-coordinator.js";

test("storage problem recovers only the affected lane", () => {
  const director = new StorageDirectorAgent();
  const affected = createTransferLane("transfer-a");
  const unrelated = createTransferLane("transfer-b");
  const areas: StorageArea[] = [
    { id: "primary", region: "a", operatingStatus: "operating-normally", availableBytes: 1000, latencyMs: 10, errorRate: 0, acceptsTransfer: true },
    { id: "backup", region: "b", operatingStatus: "operating-normally", availableBytes: 1000, latencyMs: 20, errorRate: 0, acceptsTransfer: true }
  ];

  director.organizeTransfer({ transferId: affected.transferId, laneId: affected.laneId, requiredBytes: 500, areas });
  areas[0].operatingStatus = "unavailable";

  const result = new StorageRecoveryCoordinator(director).recoverAffectedLane(affected);
  assert.equal(result.isolatedToAffectedLane, true);
  assert.equal(result.activeStorageId, "backup");
  assert.equal(affected.state, "recovering");
  assert.equal(unrelated.state, "active");
});
