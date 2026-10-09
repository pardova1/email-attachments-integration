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


for(const scenario of ["upload", "download", "invalid"] as const){
 test(`durable save rejects ${scenario} deadline without an expired tombstone`,async()=>{
  const repository=new MemoryTransferStateRepository();
  const service=new DurableTransferStateService(repository);
  const session=createTransfer({fileName:"x",contentType:"application/octet-stream",totalBytes:1,originalSha256:"a".repeat(64),senderExpirationConfirmed:true});
  const lane=createTransferLane(session.id);
  const original=await service.create(session,lane);
  const expired=new Date(Date.now()-1).toISOString();
  const current=await repository.save({...original,
   ...(scenario==="download"?{status:"available" as const,downloadAvailableAt:expired,downloadExpiresAt:expired}:{uploadExpiresAt:scenario==="invalid"?"invalid-date":expired})
  },original.version);
  if(scenario==="download")session.status="complete";
  await assert.rejects(service.save(session,lane),/TRANSFER_EXPIRED/);
  assert.deepEqual(await repository.get(session.id),current);
 });
}


async function keyFixture(){
 const repository=new MemoryTransferStateRepository(),service=new DurableTransferStateService(repository);
 const session=createTransfer({fileName:"key.bin",contentType:"application/octet-stream",totalBytes:1,originalSha256:"a".repeat(64),senderExpirationConfirmed:true});
 const state=await service.create(session,createTransferLane(session.id));
 return {repository,service,state};
}

test("persisted key reference is immutable and identical retries preserve the version",async()=>{
 const {repository,service,state}=await keyFixture();
 const saved=await service.setKeyReference(state.transferId,"first-key");
 assert.deepEqual(await service.setKeyReference(state.transferId,"first-key"),saved);
 await assert.rejects(service.setKeyReference(state.transferId,"different-key"),/TRANSFER_KEY_REFERENCE_IMMUTABLE/);
 assert.deepEqual(await repository.get(state.transferId),saved);
});

for(const tombstone of [false,true]){
 test(`key attachment rejects expiration with tombstone=${tombstone}`,async()=>{
  const {repository,service,state}=await keyFixture();
  const expired=await repository.save({...state,...(tombstone?{status:"expired" as const}:{uploadExpiresAt:new Date(Date.now()-1).toISOString()})},state.version);
  await assert.rejects(service.setKeyReference(state.transferId,"late-key"),/TRANSFER_EXPIRED/);
  assert.deepEqual(await repository.get(state.transferId),expired);
 });
}

test("completed transfers accept only retries of an already attached key",async()=>{
 const {repository,service,state}=await keyFixture();
 const available=new Date();
 const completed=await repository.save({...state,status:"available",downloadAvailableAt:available.toISOString(),downloadExpiresAt:new Date(available.getTime()+60_000).toISOString()},state.version);
 await assert.rejects(service.setKeyReference(state.transferId,"late-key"),/TRANSFER_ALREADY_COMPLETE/);
 const keyed=await repository.save({...completed,keyReference:"original-key"},completed.version);
 assert.deepEqual(await service.setKeyReference(state.transferId,"original-key"),keyed);
 await assert.rejects(service.setKeyReference(state.transferId,"replacement-key"),/TRANSFER_KEY_REFERENCE_IMMUTABLE/);
});

test("key attachment retries a progress conflict without losing confirmed parts",async()=>{
 const {repository,service,state}=await keyFixture();
 const save=repository.save.bind(repository);let attempts=0;
 repository.save=async(next,version)=>{
  if(++attempts===1)await save({...state,status:"uploading",confirmedParts:[1]},state.version);
  return save(next,version);
 };
 const saved=await service.setKeyReference(state.transferId,"new-key");
 assert.equal(attempts,2);assert.deepEqual(saved.confirmedParts,[1]);assert.equal(saved.status,"uploading");
});

test("concurrent different key attachments keep the first saved reference",async()=>{
 const {repository,service,state}=await keyFixture();
 const save=repository.save.bind(repository);let attempts=0;
 repository.save=async(next,version)=>{
  attempts++;
  await save({...state,keyReference:"winning-key"},state.version);
  return save(next,version);
 };
 await assert.rejects(service.setKeyReference(state.transferId,"losing-key"),/TRANSFER_KEY_REFERENCE_IMMUTABLE/);
 assert.equal(attempts,1);
 assert.equal((await repository.get(state.transferId))?.keyReference,"winning-key");
});

test("key attachment conflict retries are bounded",async()=>{
 const {repository,service,state}=await keyFixture();let attempts=0;
 repository.save=async()=>{attempts++;throw new Error("TRANSFER_STATE_VERSION_CONFLICT");};
 await assert.rejects(service.setKeyReference(state.transferId,"key"),/TRANSFER_STATE_VERSION_CONFLICT/);
 assert.equal(attempts,3);
 assert.equal((await repository.get(state.transferId))?.keyReference,undefined);
});


test("concurrent identical key attachment converges without a second write",async()=>{
 const {repository,service,state}=await keyFixture();
 const save=repository.save.bind(repository);let attempts=0;
 repository.save=async(next,version)=>{
  attempts++;
  await save({...state,keyReference:"shared-key"},state.version);
  return save(next,version);
 };
 const saved=await service.setKeyReference(state.transferId,"shared-key");
 assert.equal(attempts,1);assert.equal(saved.keyReference,"shared-key");
 assert.equal(saved.version,state.version+1);
});

test("expiration winning a key attachment conflict cannot receive a late key",async()=>{
 const {repository,service,state}=await keyFixture();
 const save=repository.save.bind(repository);let attempts=0;
 repository.save=async(next,version)=>{
  attempts++;
  await save({...state,status:"expired"},state.version);
  return save(next,version);
 };
 await assert.rejects(service.setKeyReference(state.transferId,"late-key"),/TRANSFER_EXPIRED/);
 assert.equal(attempts,1);
 const persisted=(await repository.get(state.transferId))!;
 assert.equal(persisted.status,"expired");assert.equal(persisted.keyReference,undefined);
});


test("durable progress cannot change original file metadata or upload timing",async()=>{
 const changes={fileName:"other.bin",contentType:"text/plain",totalBytes:2,chunkBytes:1,originalSha256:"b".repeat(64),senderExpirationConfirmed:false,
  createdAt:new Date(Date.now()-60_000),uploadExpiresAt:new Date(Date.now()+8*60*60*1000)};
 for(const [field,value] of Object.entries(changes)){
  const {repository,service,state}=await keyFixture();
  const {session,lane}=await service.restore(state.transferId);
  Object.assign(session,{[field]:value});
  session.receivedParts.add(1);session.status="uploading";
  await assert.rejects(service.save(session,lane),/TRANSFER_IDENTITY_IMMUTABLE/,field);
  assert.deepEqual(await repository.get(state.transferId),state,field);
 }
});

test("durable save rejects a replacement lane and a lane bound to another transfer",async()=>{
 for(const patch of [{laneId:"replacement-lane"},{transferId:"other-transfer"}]){
  const {repository,service,state}=await keyFixture();
  const {session,lane}=await service.restore(state.transferId);
  await assert.rejects(service.save(session,{...lane,...patch}),/TRANSFER_IDENTITY_IMMUTABLE/);
  assert.deepEqual(await repository.get(state.transferId),state);
 }
});

test("durable creation rejects a lane bound to another transfer",async()=>{
 const repository=new MemoryTransferStateRepository(),service=new DurableTransferStateService(repository);
 const session=createTransfer({fileName:"x",contentType:"application/octet-stream",totalBytes:1,originalSha256:"a".repeat(64),senderExpirationConfirmed:true});
 await assert.rejects(service.create(session,createTransferLane("different-transfer")),/TRANSFER_IDENTITY_IMMUTABLE/);
 assert.equal(await repository.get(session.id),undefined);
});

test("completed retries cannot bypass original identity validation",async()=>{
 const {repository,service,state}=await keyFixture();
 const {session,lane}=await service.restore(state.transferId);
 const available=new Date();
 const completed=await repository.save({...state,status:"available",downloadAvailableAt:available.toISOString(),downloadExpiresAt:new Date(available.getTime()+60_000).toISOString()},state.version);
 session.status="complete";session.originalSha256="b".repeat(64);
 await assert.rejects(service.save(session,lane),/TRANSFER_IDENTITY_IMMUTABLE/);
 assert.deepEqual(await repository.get(state.transferId),completed);
});

test("conflicting progress save cannot overwrite a changed authoritative deadline",async()=>{
 const {repository,service,state}=await keyFixture();
 const {session,lane}=await service.restore(state.transferId);
 session.receivedParts.add(1);session.status="uploading";
 const save=repository.save.bind(repository);let attempts=0;
 let canonical=state;
 repository.save=async(next,version)=>{
  attempts++;
  canonical=await save({...state,uploadExpiresAt:new Date(Date.now()+60_000).toISOString()},state.version);
  return save(next,version);
 };
 await assert.rejects(service.save(session,lane),/TRANSFER_IDENTITY_IMMUTABLE/);
 assert.equal(attempts,1);
 assert.deepEqual(await repository.get(state.transferId),canonical);
});
