import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { MemoryStorage } from "../src/adapters/memory-storage.js";
import { MemoryTransferStateRepository } from "../src/adapters/memory-transfer-state-repository.js";
import { TransferService } from "../src/services/transfer-service.js";

async function fixture() {
 const storage=new MemoryStorage();
 const repository=new MemoryTransferStateRepository();
 const service=new TransferService(storage,undefined,repository);
 const bytes=Buffer.from("x");
 const transfer=await service.createDurable({fileName:"a.bin",contentType:"application/octet-stream",totalBytes:1,originalSha256:createHash("sha256").update(bytes).digest("hex"),senderExpirationConfirmed:true});
 await service.uploadPart(transfer.id,1,bytes);
 return {storage,repository,service,transfer};
}

test("completion retry preserves the original download window and durable version",async()=>{
 const {repository,service,transfer}=await fixture();
 await service.complete(transfer.id);
 const state=(await repository.get(transfer.id))!;
 // Establish an older still-active window, so an accidental reset is observable without sleeps.
 const available=new Date(Date.now()-60_000),expires=new Date(available.getTime()+4*60*60*1000);
 transfer.downloadAvailableAt=available;transfer.downloadExpiresAt=expires;
 const canonical=await repository.save({...state,downloadAvailableAt:available.toISOString(),downloadExpiresAt:expires.toISOString()},state.version);
 const retried=await service.complete(transfer.id);
 assert.equal(retried.downloadAvailableAt.toISOString(),available.toISOString());
 assert.equal(retried.downloadExpiresAt.toISOString(),expires.toISOString());
 assert.equal((await repository.get(transfer.id))?.version,canonical.version);
});

test("completion retry after restart returns the same persisted window",async()=>{
 const {storage,repository,service,transfer}=await fixture();
 await service.complete(transfer.id);
 const state=(await repository.get(transfer.id))!;
 const available=new Date(Date.now()-60_000),expires=new Date(available.getTime()+4*60*60*1000);
 const canonical=await repository.save({...state,downloadAvailableAt:available.toISOString(),downloadExpiresAt:expires.toISOString()},state.version);
 const replacement=new TransferService(storage,undefined,repository);
 const retried=await replacement.complete(transfer.id);
 assert.equal(retried.downloadAvailableAt.toISOString(),canonical.downloadAvailableAt);
 assert.equal(retried.downloadExpiresAt.toISOString(),canonical.downloadExpiresAt);
});

test("overlapping completion requests in one process share verification",async()=>{
 const {storage,service,transfer}=await fixture();
 let release!:()=>void,started!:()=>void;
 const entered=new Promise<void>(resolve=>{started=resolve;});
 const ready=new Promise<void>(resolve=>{release=resolve;});
 const original=storage.complete.bind(storage);let calls=0;
 storage.complete=async(id,count)=>{calls++;started();await ready;return original(id,count);};
 const first=service.complete(transfer.id);
 await entered;
 const second=service.complete(transfer.id);
 release();
 const [a,b]=await Promise.all([first,second]);
 assert.equal(calls,1);assert.equal(a.downloadExpiresAt.getTime(),b.downloadExpiresAt.getTime());
});

test("two workers racing completion converge on the first saved window",async()=>{
 const {storage,repository,service,transfer}=await fixture();
 const replacement=new TransferService(storage,undefined,repository);
 await replacement.restore(transfer.id);
 const originalSave=repository.save.bind(repository);
 let release!:()=>void;
 const otherSaved=new Promise<void>(resolve=>{release=resolve;});let saves=0;
 repository.save=async(state,version)=>{
  const order=++saves;
  if(order===1)await otherSaved;
  const saved=await originalSave(state,version);
  if(order===2)release();
  return saved;
 };
 const [a,b]=await Promise.all([service.complete(transfer.id),replacement.complete(transfer.id)]);
 const state=(await repository.get(transfer.id))!;
 assert.equal(a.downloadAvailableAt.toISOString(),state.downloadAvailableAt);
 assert.equal(b.downloadAvailableAt.toISOString(),state.downloadAvailableAt);
 assert.equal(a.downloadExpiresAt.toISOString(),b.downloadExpiresAt.toISOString());
});

test("failed completion save publishes no window and a retry can succeed",async()=>{
 const {repository,service,transfer}=await fixture();
 const original=repository.save.bind(repository);let fail=true;
 repository.save=async(state,version)=>{if(fail){fail=false;throw new Error("DATABASE_OFFLINE");}return original(state,version);};
 await assert.rejects(service.complete(transfer.id),/DATABASE_OFFLINE/);
 assert.equal(transfer.status,"uploading");
 assert.equal(transfer.downloadAvailableAt,null);assert.equal(transfer.downloadExpiresAt,null);
 assert.equal((await repository.get(transfer.id))?.status,"uploading");
 assert.equal((await service.complete(transfer.id)).verifiedExact,true);
});

test("verification crossing upload expiry cannot start a download window",async()=>{
 const {storage,repository,service,transfer}=await fixture();
 const original=storage.complete.bind(storage);
 storage.complete=async(id,count)=>{const result=await original(id,count);transfer.uploadExpiresAt=new Date(Date.now()-1);return result;};
 await assert.rejects(service.complete(transfer.id),/TRANSFER_EXPIRED/);
 assert.equal(transfer.downloadAvailableAt,null);assert.equal(transfer.downloadExpiresAt,null);
 assert.notEqual((await repository.get(transfer.id))?.status,"available");
});


test("persisted upload expiry prevents verification despite a fresh cached deadline",async()=>{
 const {storage,repository,service,transfer}=await fixture();
 const state=(await repository.get(transfer.id))!;
 await repository.save({...state,uploadExpiresAt:new Date(Date.now()-1).toISOString()},state.version);
 let verifications=0;storage.complete=async()=>{verifications++;throw new Error("MUST_NOT_VERIFY");};
 await assert.rejects(service.complete(transfer.id),/TRANSFER_EXPIRED/);
 assert.equal(verifications,0);
 assert.equal((await repository.get(transfer.id))?.downloadAvailableAt,undefined);
});

test("persisted expiry during verification cannot open a download window",async()=>{
 const {storage,repository,service,transfer}=await fixture();
 const verify=storage.complete.bind(storage);
 storage.complete=async(id,count)=>{
  const result=await verify(id,count);
  const state=(await repository.get(id))!;
  await repository.save({...state,uploadExpiresAt:new Date(Date.now()-1).toISOString()},state.version);
  return result;
 };
 await assert.rejects(service.complete(transfer.id),/TRANSFER_EXPIRED/);
 const state=(await repository.get(transfer.id))!;
 assert.equal(state.status,"expired");
 assert.equal(state.downloadAvailableAt,undefined);
 assert.equal(state.downloadExpiresAt,undefined);
});

test("persisted expiry between refresh and completion save prevents publication",async()=>{
 const {storage,repository,transfer}=await fixture();
 const verify=storage.complete.bind(storage);
 let verified=false;
 storage.complete=async(id,count)=>{const result=await verify(id,count);verified=true;return result;};
 const replacement=new TransferService(storage,undefined,repository,undefined,{async onRestored(){
  if(!verified)return;
  const current=(await repository.get(transfer.id))!;
  await repository.save({...current,uploadExpiresAt:new Date(Date.now()-1).toISOString()},current.version);
 }});
 await assert.rejects(replacement.complete(transfer.id),/TRANSFER_EXPIRED/);
 const state=(await repository.get(transfer.id))!;
 assert.equal(state.status,"uploading");
 assert.equal(state.downloadAvailableAt,undefined);
 assert.equal(replacement.get(transfer.id).downloadAvailableAt,null);
});
