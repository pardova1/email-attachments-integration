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
 assert.equal(completed.downloadExpiresAt.getTime()-completed.downloadAvailableAt.getTime(),4*60*60*1000);

 const afterCompletion=new TransferService(storage,undefined,repository);
 const available=await afterCompletion.restore(transfer.id);
 assert.equal(afterCompletion.lane(transfer.id).laneId,laneId);
 assert.equal(available.downloadExpiresAt?.toISOString(),completed.downloadExpiresAt.toISOString());
 assert.equal(available.downloadAvailableAt?.toISOString(),completed.downloadAvailableAt.toISOString());
});


test("durable restore rehydrates the persisted private lane key reference",async()=>{
 const storage=new MemoryStorage();
 const repository=new MemoryTransferStateRepository();
 const first=new TransferService(storage,undefined,repository);
 const transfer=await first.createDurable({
  fileName:"restart.bin",contentType:"application/octet-stream",totalBytes:1,chunkBytes:1,
  originalSha256:sha256(Buffer.from("x")),senderExpirationConfirmed:true
 });
 const laneId=first.lane(transfer.id).laneId;
 await first.persistKeyReference(transfer.id,"kms-ref-restart");
 let observed:{transferId:string;laneId:string;keyReference?:string;status:string}|undefined;
 const replacement=new TransferService(storage,undefined,repository,undefined,{onRestored:state=>{observed=state;}});
 await replacement.restore(transfer.id);
 assert.deepEqual(observed,{transferId:transfer.id,laneId,keyReference:"kms-ref-restart",status:"created"});
});

test("durable restore fails closed before caching when key reference is missing",async()=>{
 const storage=new MemoryStorage();
 const repository=new MemoryTransferStateRepository();
 const first=new TransferService(storage,undefined,repository);
 const transfer=await first.createDurable({
  fileName:"missing-key.bin",contentType:"application/octet-stream",totalBytes:1,chunkBytes:1,
  originalSha256:sha256(Buffer.from("x")),senderExpirationConfirmed:true
 });
 const replacement=new TransferService(storage,undefined,repository,undefined,{onRestored:state=>{
  if(!state.keyReference) throw new Error("TRANSFER_KEY_REFERENCE_REQUIRED");
 }});
 await assert.rejects(replacement.restore(transfer.id),/TRANSFER_KEY_REFERENCE_REQUIRED/);
 assert.throws(()=>replacement.get(transfer.id),/TRANSFER_NOT_LOADED/);
});

test("durable restore awaits security initialization before publishing the session",async()=>{
 const storage=new MemoryStorage();
 const repository=new MemoryTransferStateRepository();
 const first=new TransferService(storage,undefined,repository);
 const transfer=await first.createDurable({
  fileName:"async-key.bin",contentType:"application/octet-stream",totalBytes:1,
  originalSha256:sha256(Buffer.from("x")),senderExpirationConfirmed:true
 });
 let release!:()=>void;
 let entered!:()=>void;
 const started=new Promise<void>(resolve=>{entered=resolve;});
 const ready=new Promise<void>(resolve=>{release=resolve;});
 const replacement=new TransferService(storage,undefined,repository,undefined,{
  async onRestored(){entered();await ready;}
 });
 const restoring=replacement.restore(transfer.id);
 await started;
 assert.throws(()=>replacement.get(transfer.id),/TRANSFER_NOT_LOADED/);
 release();
 await restoring;
 assert.equal(replacement.get(transfer.id).id,transfer.id);
});

test("asynchronous security restoration failure leaves the transfer unloaded",async()=>{
 const storage=new MemoryStorage();
 const repository=new MemoryTransferStateRepository();
 const first=new TransferService(storage,undefined,repository);
 const transfer=await first.createDurable({
  fileName:"unavailable-key.bin",contentType:"application/octet-stream",totalBytes:1,
  originalSha256:sha256(Buffer.from("x")),senderExpirationConfirmed:true
 });
 const replacement=new TransferService(storage,undefined,repository,undefined,{
  async onRestored(){throw new Error("KEY_VAULT_UNAVAILABLE");}
 });
 await assert.rejects(replacement.ensureLoaded(transfer.id),/KEY_VAULT_UNAVAILABLE/);
 assert.throws(()=>replacement.get(transfer.id),/TRANSFER_NOT_LOADED/);
});
