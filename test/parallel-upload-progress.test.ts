import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { MemoryStorage } from "../src/adapters/memory-storage.js";
import { MemoryTransferStateRepository } from "../src/adapters/memory-transfer-state-repository.js";
import { TransferService } from "../src/services/transfer-service.js";

async function fixture(){
 const storage=new MemoryStorage(),repository=new MemoryTransferStateRepository();
 const first=new TransferService(storage,undefined,repository);
 const bytes=Buffer.from("abcd");
 const transfer=await first.createDurable({fileName:"a.bin",contentType:"application/octet-stream",totalBytes:4,chunkBytes:2,originalSha256:createHash("sha256").update(bytes).digest("hex"),senderExpirationConfirmed:true});
 const second=new TransferService(storage,undefined,repository);
 await second.restore(transfer.id);
 return {storage,repository,first,second,transfer};
}

test("different workers preserve both uploaded parts and complete from durable progress",async()=>{
 const {repository,first,second,transfer}=await fixture();
 await first.uploadPart(transfer.id,1,Buffer.from("ab"));
 const progress=await second.uploadPart(transfer.id,2,Buffer.from("cd"));
 assert.equal(progress.percent,100);
 assert.deepEqual((await repository.get(transfer.id))?.confirmedParts,[1,2]);
 assert.equal((await first.complete(transfer.id)).verifiedExact,true);
});

test("conflicting upload saves retry with merged progress",async()=>{
 const {repository,first,second,transfer}=await fixture();
 const original=repository.save.bind(repository);
 let release!:()=>void;
 const otherSaved=new Promise<void>(resolve=>{release=resolve;});let calls=0;
 repository.save=async(state,version)=>{
  const order=++calls;
  if(order===1)await otherSaved;
  const result=await original(state,version);
  if(order===2)release();
  return result;
 };
 await Promise.all([first.uploadPart(transfer.id,1,Buffer.from("ab")),second.uploadPart(transfer.id,2,Buffer.from("cd"))]);
 assert.equal(calls,3);
 assert.deepEqual((await repository.get(transfer.id))?.confirmedParts,[1,2]);
 const restarted=new TransferService(new MemoryStorage(),undefined,repository);
 await restarted.restore(transfer.id);
 assert.equal(restarted.status(transfer.id).percent,100);
});

test("failed upload metadata save publishes no progress and identical retry succeeds",async()=>{
 const {repository,first,transfer}=await fixture();
 const original=repository.save.bind(repository);let fail=true;
 repository.save=async(state,version)=>{if(fail){fail=false;throw new Error("DATABASE_OFFLINE");}return original(state,version);};
 await assert.rejects(first.uploadPart(transfer.id,1,Buffer.from("ab")),/DATABASE_OFFLINE/);
 assert.equal(first.status(transfer.id).receivedParts,0);
 assert.equal(transfer.status,"created");
 assert.deepEqual((await repository.get(transfer.id))?.confirmedParts,[]);
 assert.equal((await first.uploadPart(transfer.id,1,Buffer.from("ab"))).receivedParts,1);
});

test("persistent optimistic conflicts have bounded retries and no false acknowledgment",async()=>{
 const {repository,first,transfer}=await fixture();let attempts=0;
 repository.save=async()=>{attempts++;throw new Error("TRANSFER_STATE_VERSION_CONFLICT");};
 await assert.rejects(first.uploadPart(transfer.id,1,Buffer.from("ab")),/TRANSFER_STATE_VERSION_CONFLICT/);
 assert.equal(attempts,3);assert.equal(first.status(transfer.id).receivedParts,0);
});

test("upload write that crosses expiration cannot advance progress",async()=>{
 const {storage,first,transfer,repository}=await fixture();
 const original=storage.putPart.bind(storage);
 storage.putPart=async(id,number,bytes)=>{await original(id,number,bytes);transfer.uploadExpiresAt=new Date(Date.now()-1);};
 await assert.rejects(first.uploadPart(transfer.id,1,Buffer.from("ab")),/TRANSFER_EXPIRED/);
 assert.deepEqual((await repository.get(transfer.id))?.confirmedParts,[]);
});
