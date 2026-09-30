import assert from "node:assert/strict";
import test from "node:test";
import { createTransferLane } from "../src/scaling/transfer-lane.js";

test("each transfer receives its own logical lane", () => {
  const a = createTransferLane("transfer-a");
  const b = createTransferLane("transfer-b");
  assert.notEqual(a.laneId, b.laneId);
  assert.notEqual(a.isolationKey, b.isolationKey);
  assert.equal(a.transferId, "transfer-a");
  assert.equal(b.transferId, "transfer-b");
});
