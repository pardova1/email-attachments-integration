import assert from "node:assert/strict";
import test from "node:test";
import { TransferRoutingAgent } from "../src/operations/transfer-routing-agent.js";
import { StorageDirectorAgent, type StorageArea } from "../src/storage/storage-director-agent.js";

test("email receives label, lane and fastest eligible storage route", () => {
  const areas: StorageArea[] = [
    { id: "slow", region: "a", operatingStatus: "operating-normally", availableBytes: 10_000, latencyMs: 5, errorRate: 0, acceptsTransfer: true, estimatedThroughputBytesPerSecond: 100 },
    { id: "fast", region: "b", operatingStatus: "operating-normally", availableBytes: 10_000, latencyMs: 20, errorRate: 0, acceptsTransfer: true, estimatedThroughputBytesPerSecond: 1000 },
    { id: "backup", region: "c", operatingStatus: "operating-normally", availableBytes: 10_000, latencyMs: 25, errorRate: 0, acceptsTransfer: true, estimatedThroughputBytesPerSecond: 900 }
  ];

  const routed = new TransferRoutingAgent(new StorageDirectorAgent()).assign({
    transferId: "transfer-1", totalBytes: 5000, storageAreas: areas
  });

  assert.match(routed.transferLabel, /^EMAIL-TRANSFER-/);
  assert.equal(routed.lane.transferId, "transfer-1");
  assert.equal(routed.storage.route.primary.id, "fast");
  assert.equal(routed.objective, "fastest-secure-eligible-delivery");
});
