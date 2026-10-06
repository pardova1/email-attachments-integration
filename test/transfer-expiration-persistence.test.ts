import assert from "node:assert/strict";
import test from "node:test";
import { MemoryStorage } from "../src/adapters/memory-storage.js";
import { MemoryTransferStateRepository } from "../src/adapters/memory-transfer-state-repository.js";
import { TransferService } from "../src/services/transfer-service.js";

test("expired durable transfer cannot be restored as active",async()=>{
 const repository=new MemoryTransferStateRepository();
 const first=new TransferService(new MemoryStorage(),undefined,repository);
 const transfer=await first.createDurable({
  fileName:"file.bin",contentType:"application/octet-stream",totalBytes:1,
  originalSha256:"a".repeat(64),senderExpirationConfirmed:true
 });
 const state=await repository.get(transfer.id);
 assert.ok(state);
 await repository.save({...state,uploadExpiresAt:new Date(Date.now()-1000).toISOString()},state.version);

 const replacement=new TransferService(new MemoryStorage(),undefined,repository);
 await assert.rejects(()=>replacement.restore(transfer.id),/TRANSFER_EXPIRED/);
 const expired=await repository.get(transfer.id);
 assert.equal(expired?.status,"expired");
});
