import assert from "node:assert/strict";
import test from "node:test";
import { RouteOptimizationAgent } from "../src/operations/route-optimization-agent.js";
import type { StorageArea } from "../src/storage/storage-director-agent.js";

test("individual lane switches when another eligible route is materially faster", () => {
  const areas: StorageArea[] = [
    { id: "current", region: "a", operatingStatus: "operating-normally", availableBytes: 100000, latencyMs: 10, errorRate: 0, acceptsTransfer: true, estimatedThroughputBytesPerSecond: 100 },
    { id: "faster", region: "b", operatingStatus: "operating-normally", availableBytes: 100000, latencyMs: 20, errorRate: 0, acceptsTransfer: true, estimatedThroughputBytesPerSecond: 1000 }
  ];
  const result = new RouteOptimizationAgent().evaluate({
    transferId: "t1", laneId: "l1", remainingBytes: 50000, activeStorageId: "current", areas
  });
  assert.equal(result.action, "switch-route");
  assert.equal(result.selectedStorageId, "faster");
});

test("agent avoids unnecessary route movement for insignificant gain", () => {
  const areas: StorageArea[] = [
    { id: "current", region: "a", operatingStatus: "operating-normally", availableBytes: 100000, latencyMs: 10, errorRate: 0, acceptsTransfer: true, estimatedThroughputBytesPerSecond: 1000 },
    { id: "other", region: "b", operatingStatus: "operating-normally", availableBytes: 100000, latencyMs: 9, errorRate: 0, acceptsTransfer: true, estimatedThroughputBytesPerSecond: 1001 }
  ];
  const result = new RouteOptimizationAgent().evaluate({
    transferId: "t2", laneId: "l2", remainingBytes: 50000, activeStorageId: "current", areas
  });
  assert.equal(result.action, "continue-current");
});
