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


test("cached upload expiry cannot purge another worker's active download window",async()=>{
 const {storage,repository,first,second,transfer,cached}=await fixture();
 const completed=await first.complete(transfer.id);
 cached.uploadExpiresAt=new Date(Date.now()-1);
 assert.throws(()=>second.get(transfer.id),/TRANSFER_EXPIRED/);
 let purged=false;
 const purge=storage.purge.bind(storage);
 storage.purge=async(id)=>{purged=true;await purge(id);};
 assert.equal(await second.expireIfNeeded(transfer.id),false);
 assert.equal(purged,false);
 assert.equal((await repository.get(transfer.id))?.status,"available");
 assert.equal((await second.refresh(transfer.id)).downloadExpiresAt?.getTime(),completed.downloadExpiresAt.getTime());
 assert.equal((await storage.readPart(transfer.id,1)).toString(),"x");
});

test("durable expiration cleanup works without a cache and retries persisted key retirement",async()=>{
 const {storage,repository,transfer}=await fixture();
 const state=(await repository.get(transfer.id))!;
 await repository.save({...state,keyReference:"saved-key",uploadExpiresAt:new Date(Date.now()-1).toISOString()},state.version);
 let attempts=0;
 const replacement=new TransferService(storage,undefined,repository,{async onExpired(id,crypto){
  assert.equal(id,transfer.id);
  assert.deepEqual(crypto,{laneId:state.laneId,keyReference:"saved-key"});
  if(++attempts===1)throw new Error("KEY_VAULT_UNAVAILABLE");
 }});
 await assert.rejects(replacement.expireIfNeeded(transfer.id),/KEY_VAULT_UNAVAILABLE/);
 assert.equal((await repository.get(transfer.id))?.status,"expired");
 assert.equal(await replacement.expireIfNeeded(transfer.id),true);
 assert.equal(attempts,2);
 assert.throws(()=>replacement.get(transfer.id),/TRANSFER_NOT_LOADED/);
});

test("completion racing conditional expiration is protected by the version check",async()=>{
 const {storage,repository,second,transfer}=await fixture();
 const state=(await repository.get(transfer.id))!;
 await repository.save({...state,uploadExpiresAt:new Date(Date.now()-1).toISOString()},state.version);
 const save=repository.save.bind(repository);
 repository.save=async(next,version)=>{
  const current=(await repository.get(transfer.id))!;
  const available=new Date();
  await save({...current,status:"available",downloadAvailableAt:available.toISOString(),downloadExpiresAt:new Date(available.getTime()+4*60*60*1000).toISOString()},current.version);
  return save(next,version);
 };
 let purged=false;storage.purge=async()=>{purged=true;};
 await assert.rejects(second.expireIfNeeded(transfer.id),/TRANSFER_STATE_VERSION_CONFLICT/);
 assert.equal(purged,false);
 assert.equal((await repository.get(transfer.id))?.status,"available");
});


test("stale worker rejects completed uploads before touching storage",async()=>{
 const {storage,first,second,transfer}=await fixture();
 await first.complete(transfer.id);
 let writes=0;storage.putPart=async()=>{writes++;};
 await assert.rejects(second.uploadPart(transfer.id,1,Buffer.from("x")),/TRANSFER_ALREADY_COMPLETE/);
 assert.equal(writes,0);
});

test("stale worker rejects expired uploads before touching storage",async()=>{
 const {storage,repository,second,transfer}=await fixture();
 const state=(await repository.get(transfer.id))!;
 await repository.save({...state,status:"expired"},state.version);
 let writes=0;storage.putPart=async()=>{writes++;};
 await assert.rejects(second.uploadPart(transfer.id,1,Buffer.from("x")),/TRANSFER_EXPIRED/);
 assert.equal(writes,0);
});

test("upload state read failure prevents a storage write and clears the cache",async()=>{
 const {storage,repository,second,transfer}=await fixture();
 repository.get=async()=>{throw new Error("DATABASE_OFFLINE");};
 let writes=0;storage.putPart=async()=>{writes++;};
 await assert.rejects(second.uploadPart(transfer.id,1,Buffer.from("x")),/DATABASE_OFFLINE/);
 assert.equal(writes,0);
 assert.throws(()=>second.get(transfer.id),/TRANSFER_NOT_LOADED/);
});

test("upload crossing a persisted deadline cannot acknowledge progress",async()=>{
 const {storage,repository,second,transfer}=await fixture();
 const write=storage.putPart.bind(storage);
 storage.putPart=async(id,number,bytes)=>{
  await write(id,number,bytes);
  const state=(await repository.get(id))!;
  await repository.save({...state,uploadExpiresAt:new Date(Date.now()-1).toISOString()},state.version);
 };
 await assert.rejects(second.uploadPart(transfer.id,1,Buffer.from("x")),/TRANSFER_EXPIRED/);
 assert.equal((await repository.get(transfer.id))?.status,"expired");
 assert.throws(()=>second.get(transfer.id),/TRANSFER_NOT_LOADED/);
});

test("another worker completing during a storage write prevents upload acknowledgment",async()=>{
 const {storage,first,second,transfer}=await fixture();
 const write=storage.putPart.bind(storage);
 storage.putPart=async(id,number,bytes)=>{await write(id,number,bytes);await first.complete(id);};
 await assert.rejects(second.uploadPart(transfer.id,1,Buffer.from("x")),/TRANSFER_ALREADY_COMPLETE/);
 assert.equal(second.get(transfer.id).status,"complete");
});
