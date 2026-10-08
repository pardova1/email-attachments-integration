import assert from "node:assert/strict";
import test from "node:test";
import { MemoryStorage } from "../src/adapters/memory-storage.js";
import { MemoryTransferStateRepository } from "../src/adapters/memory-transfer-state-repository.js";
import { TransferService } from "../src/services/transfer-service.js";
import { PrivateLaneLifecycleCoordinator } from "../src/security/private-lane-lifecycle-coordinator.js";
import { TransferCryptoContextService } from "../src/security/transfer-crypto-context.js";
import { createHash } from "node:crypto";

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

test("expiration after restart retires the persisted key without activating the transfer",async()=>{
 const repository=new MemoryTransferStateRepository();
 const storage=new MemoryStorage();
 const first=new TransferService(storage,undefined,repository);
 const transfer=await first.createDurable({
  fileName:"offline.bin",contentType:"application/octet-stream",totalBytes:1,
  originalSha256:"a".repeat(64),senderExpirationConfirmed:true
 });
 await first.persistKeyReference(transfer.id,"key-offline");
 const state=await repository.get(transfer.id);
 assert.ok(state);
 await repository.save({...state,uploadExpiresAt:new Date(Date.now()-1000).toISOString()},state.version);
 const destroyed:string[]=[];
 const lifecycle=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService({
  async createKey(){throw new Error("MUST_NOT_CREATE_KEY");},
  async destroyKey(reference){destroyed.push(reference);}
 }));
 const replacement=new TransferService(storage,undefined,repository,
  {onExpired:(id,crypto)=>lifecycle.onExpired(id,crypto)},
  {onRestored(){throw new Error("MUST_NOT_ACTIVATE_EXPIRED_TRANSFER");}}
 );
 await assert.rejects(replacement.restore(transfer.id),/TRANSFER_EXPIRED/);
 assert.deepEqual(destroyed,["key-offline"]);
 assert.equal(lifecycle.get(transfer.id)?.laneId,state.laneId);
 assert.equal(lifecycle.get(transfer.id)?.status,"retired");
 assert.throws(()=>replacement.get(transfer.id),/TRANSFER_NOT_LOADED/);
 await assert.rejects(replacement.restore(transfer.id),/TRANSFER_EXPIRED/);
 assert.deepEqual(destroyed,["key-offline"]);
});

test("persisted expired status blocks restore even when its timestamps are in the future",async()=>{
 const repository=new MemoryTransferStateRepository();
 const first=new TransferService(new MemoryStorage(),undefined,repository);
 const transfer=await first.createDurable({
  fileName:"expired.bin",contentType:"application/octet-stream",totalBytes:1,
  originalSha256:"a".repeat(64),senderExpirationConfirmed:true
 });
 const state=await repository.get(transfer.id);
 assert.ok(state);
 await repository.save({...state,status:"expired"},state.version);
 const replacement=new TransferService(new MemoryStorage(),undefined,repository);
 await assert.rejects(replacement.restore(transfer.id),/TRANSFER_EXPIRED/);
 assert.throws(()=>replacement.get(transfer.id),/TRANSFER_NOT_LOADED/);
});

test("download expiry cleanup still runs after get marks the cached transfer expired",async()=>{
 const repository=new MemoryTransferStateRepository();
 const storage=new MemoryStorage();
 const service=new TransferService(storage,undefined,repository);
 const bytes=Buffer.from("x");
 const transfer=await service.createDurable({
  fileName:"complete.bin",contentType:"application/octet-stream",totalBytes:1,
  originalSha256:createHash("sha256").update(bytes).digest("hex"),senderExpirationConfirmed:true
 });
 await service.uploadPart(transfer.id,1,bytes);
 await service.complete(transfer.id);
 transfer.downloadExpiresAt=new Date(Date.now()-1000);
 const state=(await repository.get(transfer.id))!;
 await repository.save({...state,downloadExpiresAt:transfer.downloadExpiresAt.toISOString()},state.version);
 assert.throws(()=>service.get(transfer.id),/TRANSFER_EXPIRED/);
 assert.equal(await service.expireIfNeeded(transfer.id),true);
 assert.equal((await repository.get(transfer.id))?.status,"expired");
 await assert.rejects(storage.readPart(transfer.id,1),/TRANSFER_NOT_READY/);
});

test("failed key retirement after restart can be retried without publishing the transfer",async()=>{
 const repository=new MemoryTransferStateRepository();
 const storage=new MemoryStorage();
 const first=new TransferService(storage,undefined,repository);
 const transfer=await first.createDurable({
  fileName:"retry.bin",contentType:"application/octet-stream",totalBytes:1,
  originalSha256:"a".repeat(64),senderExpirationConfirmed:true
 });
 await first.persistKeyReference(transfer.id,"key-retry");
 const state=await repository.get(transfer.id);
 assert.ok(state);
 await repository.save({...state,status:"expired"},state.version);
 let attempts=0;
 const lifecycle=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService({
  async createKey(){throw new Error("MUST_NOT_CREATE_KEY");},
  async destroyKey(){if(++attempts===1)throw new Error("KEY_VAULT_UNAVAILABLE");}
 }));
 const replacement=new TransferService(storage,undefined,repository,
  {onExpired:(id,crypto)=>lifecycle.onExpired(id,crypto)}
 );
 await assert.rejects(replacement.restore(transfer.id),/KEY_VAULT_UNAVAILABLE/);
 assert.throws(()=>replacement.get(transfer.id),/TRANSFER_NOT_LOADED/);
 await assert.rejects(replacement.restore(transfer.id),/TRANSFER_EXPIRED/);
 assert.equal(attempts,2);
 assert.equal(lifecycle.get(transfer.id)?.status,"retired");
});
