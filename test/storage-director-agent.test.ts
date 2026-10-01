import assert from "node:assert/strict";
import test from "node:test";
import { StorageDirectorAgent, type StorageArea } from "../src/storage/storage-director-agent.js";

const areas: StorageArea[] = [
  { id: "nearby", region: "region-a", operatingStatus: "operating-normally", availableBytes: 1_000, latencyMs: 20, errorRate: 0, acceptsTransfer: true },
  { id: "backup", region: "region-b", operatingStatus: "operating-normally", availableBytes: 1_000, latencyMs: 45, errorRate: 0, acceptsTransfer: true },
  { id: "problem", region: "region-c", operatingStatus: "degraded", availableBytes: 1_000, latencyMs: 10, errorRate: .1, acceptsTransfer: true }
];

test("director selects primary and independent backup storage", () => {
  const route = new StorageDirectorAgent().selectRoute(areas, 500);
  assert.equal(route.primary.id, "nearby");
  assert.equal(route.backup.id, "backup");
  assert.notEqual(route.primary.id, route.backup.id);
});

test("backup activation follows required recovery sequence", () => {
  const director = new StorageDirectorAgent();
  const route = director.selectRoute(areas, 500);
  const result = director.activateBackup(route);
  assert.deepEqual(result.stages, [
    "automatically-activated",
    "analyzing",
    "correcting-any-issues",
    "affected-transfer-continues",
    "other-lanes-remain-unaffected",
    "verified-exact"
  ]);
});
