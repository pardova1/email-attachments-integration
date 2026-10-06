import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { MemoryStorage } from "../src/adapters/memory-storage.js";
import { MemoryTransferStateRepository } from "../src/adapters/memory-transfer-state-repository.js";
import { TransferService } from "../src/services/transfer-service.js";

const sha256=(b:Buffer)=>createHash("sha256").update(b).digest("hex");

test("TransferService survives process replacement without changing lane or expiration",async()=>{
 const bytes=Buffer.from("1234567890");
 const storage=new MemoryStorage();
 const repository=new MemoryTransferStateRepository();
 const first=new TransferService(storage,undefined,repository);
 const transfer=await first.createDurable({
  fileName:"video.mp4",contentType:"video/mp4",totalBytes:bytes.length,chunkBytes:5,
  originalSha256:sha256(bytes),senderExpirationConfirmed:true
 });
 const laneId=first.lane(transfer.id).laneId;
 const uploadExpiry=transfer.uploadExpiresAt.toISOString();
 await first.uploadPart(transfer.id,1,bytes.subarray(0,5));

 const replacement=new TransferService(storage,undefined,repository);
 const restored=await replacement.restore(transfer.id);
 assert.equal(restored.id,transfer.id);
 assert.equal(replacement.lane(transfer.id).laneId,laneId);
 assert.equal(restored.uploadExpiresAt.toISOString(),uploadExpiry);
 assert.equal(replacement.status(transfer.id).percent,50);

 await replacement.uploadPart(transfer.id,2,bytes.subarray(5));
 const completed=await replacement.complete(transfer.id);
 assert.equal(completed.verifiedExact,true);
 assert.ok(completed.downloadAvailableAt);
 assert.ok(completed.downloadExpiresAt);
 assert.equal(completed.downloadExpiresAt.getTime()-completed.downloadAvailableAt.getTime(),4*60*60*1000);

 const afterCompletion=new TransferService(storage,undefined,repository);
 const available=await afterCompletion.restore(transfer.id);
 assert.equal(afterCompletion.lane(transfer.id).laneId,laneId);
 assert.equal(available.downloadExpiresAt?.toISOString(),completed.downloadExpiresAt.toISOString());
 assert.equal(available.downloadAvailableAt?.toISOString(),completed.downloadAvailableAt.toISOString());
});
