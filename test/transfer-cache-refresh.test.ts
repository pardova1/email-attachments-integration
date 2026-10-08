import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { MemoryStorage } from "../src/adapters/memory-storage.js";
import { MemoryTransferStateRepository } from "../src/adapters/memory-transfer-state-repository.js";
import { TransferService } from "../src/services/transfer-service.js";

async function fixture(){
 const storage=new MemoryStorage(),repository=new MemoryTransferStateRepository();
 const first=new TransferService(storage,undefined,repository),bytes=Buffer.from("x");
 const transfer=await first.createDurable({fileName:"a.bin",contentType:"application/octet-stream",totalBytes:1,originalSha256:createHash("sha256").update(bytes).digest("hex"),senderExpirationConfirmed:true});
 const second=new TransferService(storage,undefined,repository);
 const cached=await second.restore(transfer.id);
 await first.uploadPart(transfer.id,1,bytes);
 return {storage,repository,first,second,transfer,cached};
}

test("refresh observes another worker's completion without changing its deadline",async()=>{
 const {first,second,transfer,cached}=await fixture();
 const completed=await first.complete(transfer.id);
 assert.equal(second.get(transfer.id).status,"created");
 const refreshed=await second.refresh(transfer.id);
 assert.equal(refreshed,cached);
 assert.equal(refreshed.status,"complete");
 assert.equal(refreshed.downloadExpiresAt?.getTime(),completed.downloadExpiresAt.getTime());
 assert.equal(second.status(transfer.id).percent,100);
});

test("refresh blocks a cached transfer expired by another worker",async()=>{
 const {repository,first,second,transfer}=await fixture();
 await first.complete(transfer.id);await second.refresh(transfer.id);
 const state=(await repository.get(transfer.id))!;
 await repository.save({...state,status:"expired"},state.version);
 await assert.rejects(second.refresh(transfer.id),/TRANSFER_EXPIRED/);
 assert.throws(()=>second.get(transfer.id),/TRANSFER_NOT_LOADED/);
});

test("refresh read failure clears stale cache and a later refresh recovers",async()=>{
 const {repository,second,transfer}=await fixture();
 const original=repository.get.bind(repository);
 repository.get=async()=>{throw new Error("DATABASE_OFFLINE");};
 await assert.rejects(second.refresh(transfer.id),/DATABASE_OFFLINE/);
 assert.throws(()=>second.get(transfer.id),/TRANSFER_NOT_LOADED/);
 repository.get=original;
 assert.equal((await second.refresh(transfer.id)).receivedParts.size,1);
});

test("stale expired snapshot cannot purge a concurrently established download window",async()=>{
 const {storage,repository,second,transfer}=await fixture();
 const current=(await repository.get(transfer.id))!;
 await repository.save({...current,uploadExpiresAt:new Date(Date.now()-1).toISOString()},current.version);
 const originalGet=repository.get.bind(repository),originalSave=repository.save.bind(repository);
 let reads=0,purged=false;
 storage.purge=async()=>{purged=true;};
 repository.get=async(id)=>{
  const snapshot=await originalGet(id);
  if(++reads===1){
   const available=new Date();
   await originalSave({...snapshot!,status:"available",downloadAvailableAt:available.toISOString(),downloadExpiresAt:new Date(available.getTime()+4*60*60*1000).toISOString()},snapshot!.version);
  }
  return snapshot;
 };
 await assert.rejects(second.refresh(transfer.id),/TRANSFER_STATE_CHANGED_RETRY_REQUIRED/);
 assert.equal(purged,false);
 assert.equal((await second.refresh(transfer.id)).status,"complete");
});
