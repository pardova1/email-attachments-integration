import assert from "node:assert/strict";
import test from "node:test";
import { CleanupService } from "../src/operations/cleanup-service.js";

test("purges temporary transit data after expiration", async () => {
  const purged: string[] = [];
  const cleanup = new CleanupService({ purge: async id => { purged.push(id); } });
  const didPurge = await cleanup.purgeIfExpired("t1", new Date(1000), new Date(1001));
  assert.equal(didPurge, true);
  assert.deepEqual(purged, ["t1"]);
});

test("does not purge before expiration", async () => {
  const purged: string[] = [];
  const cleanup = new CleanupService({ purge: async id => { purged.push(id); } });
  const didPurge = await cleanup.purgeIfExpired("t1", new Date(2000), new Date(1000));
  assert.equal(didPurge, false);
  assert.deepEqual(purged, []);
});
