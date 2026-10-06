import assert from "node:assert/strict";
import test from "node:test";
import { MemoryTransferStateRepository } from "../src/adapters/memory-transfer-state-repository.js";

const state = {
  transferId:"t1", laneId:"l1", status:"uploading" as const,
  fileName:"large-video.mp4", contentType:"video/mp4", chunkBytes:64*1024**2,
  originalSha256:"a".repeat(64), senderExpirationConfirmed:true,
  createdAt:"2026-10-02T20:00:00.000Z", totalBytes:500_000_000_000,
  confirmedParts:[1], partSha256:{1:"p1"},
  uploadExpiresAt:"2026-10-03T00:00:00.000Z", updatedAt:"2026-10-02T20:00:00.000Z", version:1
};

test("transfer state survives outside service object and can be reloaded", async () => {
  const repo = new MemoryTransferStateRepository();
  await repo.create(state);
  const restored = await repo.get("t1");
  assert.equal(restored?.laneId,"l1");
  assert.deepEqual(restored?.confirmedParts,[1]);
});

test("optimistic version prevents competing workers overwriting newer state", async () => {
  const repo = new MemoryTransferStateRepository();
  await repo.create(state);
  const first = await repo.save({...state,status:"recovering"},1);
  assert.equal(first.version,2);
  await assert.rejects(repo.save({...state,status:"verified"},1),/VERSION_CONFLICT/);
});
