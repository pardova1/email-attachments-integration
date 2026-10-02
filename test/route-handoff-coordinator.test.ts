import assert from "node:assert/strict";
import test from "node:test";
import { RouteHandoffCoordinator } from "../src/operations/route-handoff-coordinator.js";

test("route handoff resumes after verified checkpoint", () => {
  const result = new RouteHandoffCoordinator().prepare({
    transferId: "t1", laneId: "l1", confirmedParts: [1,2,3],
    partSha256: {1:"a",2:"b",3:"c"}, sourceStorageId: "storage-a"
  }, "storage-b");
  assert.equal(result.resumeAfterPart, 3);
  assert.equal(result.verifiedCheckpoint, true);
  assert.equal(result.unrelatedLanesAffected, false);
});

test("handoff refuses unverified checkpoint", () => {
  assert.throws(() => new RouteHandoffCoordinator().prepare({
    transferId: "t1", laneId: "l1", confirmedParts: [1,2],
    partSha256: {1:"a"}, sourceStorageId: "storage-a"
  }, "storage-b"), /CHECKPOINT_INTEGRITY_MISSING/);
});
