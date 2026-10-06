import assert from "node:assert/strict";
import test from "node:test";
import { MemoryTransferStateRepository } from "../src/adapters/memory-transfer-state-repository.js";
import { DurableTransferStateService } from "../src/services/durable-transfer-state-service.js";
import { createTransfer } from "../src/domain/transfer.js";
import { createTransferLane } from "../src/scaling/transfer-lane.js";

test("replacement service restores same transfer lane progress and expiration",async()=>{
 const repository=new MemoryTransferStateRepository();
 const firstWorker=new DurableTransferStateService(repository);
 const session=createTransfer({
  fileName:"video.mp4",contentType:"video/mp4",totalBytes:10,chunkBytes:5,
  originalSha256:"a".repeat(64),senderExpirationConfirmed:true
 });
 const lane=createTransferLane(session.id);
 session.receivedParts.add(1);
 await firstWorker.create(session,lane);
 await firstWorker.save(session,lane);

 // Simulates a replacement worker with empty process memory but the same durable repository.
 const replacementWorker=new DurableTransferStateService(repository);
 const restored=await replacementWorker.restore(session.id);
 assert.equal(restored.session.id,session.id);
 assert.equal(restored.lane.laneId,lane.laneId);
 assert.deepEqual([...restored.session.receivedParts],[1]);
 assert.equal(restored.session.uploadExpiresAt.toISOString(),session.uploadExpiresAt.toISOString());
});
