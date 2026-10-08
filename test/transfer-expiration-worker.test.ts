import assert from "node:assert/strict";
import test from "node:test";
import { MemoryStorage } from "../src/adapters/memory-storage.js";
import { MemoryTransferStateRepository } from "../src/adapters/memory-transfer-state-repository.js";
import { TransferService } from "../src/services/transfer-service.js";
import { TransferExpirationWorker } from "../src/services/transfer-expiration-worker.js";
import { DurableTransferStateService } from "../src/services/durable-transfer-state-service.js";
import { createTransfer } from "../src/domain/transfer.js";
import { createTransferLane } from "../src/scaling/transfer-lane.js";

const input = {fileName:"a.bin",contentType:"application/octet-stream",totalBytes:1,originalSha256:"a".repeat(64),senderExpirationConfirmed:true};

test("background cleanup expires unloaded transfers and retires their saved keys",async()=>{
 const repository=new MemoryTransferStateRepository();
 const storage=new MemoryStorage();
 const creator=new TransferService(storage,undefined,repository);
 const transfer=await creator.createDurable(input);
 await creator.persistKeyReference(transfer.id,"key-background");
 const state=(await repository.get(transfer.id))!;
 await repository.save({...state,uploadExpiresAt:new Date(Date.now()-1000).toISOString()},state.version);
 const retired:string[]=[];
 const replacement=new TransferService(storage,undefined,repository,{async onExpired(id,crypto){
  assert.equal(id,transfer.id); retired.push(crypto!.keyReference!);
 }});
 const result=await new TransferExpirationWorker(repository,replacement).runOnce();
 assert.equal(result.cleaned,1);
 assert.deepEqual(retired,["key-background"]);
 assert.equal((await repository.get(transfer.id))?.status,"expired");
 assert.throws(()=>replacement.get(transfer.id),/TRANSFER_NOT_LOADED/);
});

test("download window overrides an older upload deadline in candidate selection",async()=>{
 const repository=new MemoryTransferStateRepository();
 const creator=new TransferService(new MemoryStorage(),undefined,repository);
 const transfer=await creator.createDurable(input);
 const state=(await repository.get(transfer.id))!;
 await repository.save({...state,status:"available",uploadExpiresAt:new Date(Date.now()-1000).toISOString(),downloadExpiresAt:new Date(Date.now()+60_000).toISOString()},state.version);
 assert.deepEqual(await repository.listExpirationCandidates(new Date(),10),[]);
 assert.equal(await creator.cleanupExpired(transfer.id),false);
});

test("failed first record does not starve later batches and is retried after cursor wraps",async()=>{
 const seen:string[]=[];
 const worker=new TransferExpirationWorker({async listExpirationCandidates(_cutoff,limit,after){
  return ["a","b","c"].filter(id=>!after||id>after).slice(0,limit);
 }},{async cleanupExpired(id){seen.push(id);if(id==="a")throw new Error("RETRY");return true;}},1);
 assert.equal((await worker.runOnce()).failed,1);
 assert.equal((await worker.runOnce()).cleaned,1);
 assert.equal((await worker.runOnce()).cleaned,1);
 assert.equal((await worker.runOnce()).scanned,0);
 assert.equal((await worker.runOnce()).failed,1);
 assert.deepEqual(seen,["a","b","c","a"]);
});

test("overlapping ticks are skipped and scan failure does not disable later ticks",async()=>{
 let release!:()=>void;
 const ready=new Promise<void>(resolve=>{release=resolve;});
 let calls=0;
 const worker=new TransferExpirationWorker({async listExpirationCandidates(){
  if(++calls===1){await ready;throw new Error("DATABASE_OFFLINE");}return [];
 }},{async cleanupExpired(){return true;}});
 const first=worker.runOnce();
 assert.equal((await worker.runOnce()).skipped,true);
 release();
 await assert.rejects(first,/DATABASE_OFFLINE/);
 assert.equal((await worker.runOnce()).skipped,false);
});

test("concurrent completion prevents stale expiration from purging data",async()=>{
 const repository=new MemoryTransferStateRepository();
 const creator=new TransferService(new MemoryStorage(),undefined,repository);
 const transfer=await creator.createDurable(input);
 const state=(await repository.get(transfer.id))!;
 await repository.save({...state,uploadExpiresAt:new Date(Date.now()-1000).toISOString()},state.version);
 const originalSave=repository.save.bind(repository);
 repository.save=async(next,version)=>{
  const current=(await repository.get(transfer.id))!;
  await originalSave({...current,status:"available",downloadExpiresAt:new Date(Date.now()+60_000).toISOString()},current.version);
  return originalSave(next,version);
 };
 let purged=false;
 const storage=new MemoryStorage();
 storage.purge=async()=>{purged=true;};
 const cleaner=new TransferService(storage,undefined,repository);
 await assert.rejects(cleaner.cleanupExpired(transfer.id),/TRANSFER_STATE_VERSION_CONFLICT/);
 assert.equal(purged,false);
 assert.equal((await repository.get(transfer.id))?.status,"available");
});

test("late session save cannot reactivate a transfer expired by the worker",async()=>{
 const repository=new MemoryTransferStateRepository();
 const durable=new DurableTransferStateService(repository);
 const session=createTransfer(input);
 const lane=createTransferLane(session.id);
 await durable.create(session,lane);
 await durable.expire(session.id);
 session.status="complete";
 await assert.rejects(durable.save(session,lane),/TRANSFER_EXPIRED/);
 assert.equal((await repository.get(session.id))?.status,"expired");
});

test("cleanup failure remains retryable in durable state",async()=>{
 const repository=new MemoryTransferStateRepository();
 const storage=new MemoryStorage();
 const creator=new TransferService(storage,undefined,repository);
 const transfer=await creator.createDurable(input);
 const state=(await repository.get(transfer.id))!;
 await repository.save({...state,status:"expired"},state.version);
 let attempts=0;
 storage.purge=async()=>{if(++attempts===1)throw new Error("STORAGE_OFFLINE");};
 const worker=new TransferExpirationWorker(repository,new TransferService(storage,undefined,repository));
 assert.equal((await worker.runOnce()).failed,1);
 await worker.runOnce(); // end of pass resets cursor
 assert.equal((await worker.runOnce()).cleaned,1);
 assert.equal(attempts,2);
});

test("worker starts cleanup immediately and supports stopping its timer",async()=>{
 let reported!:(value:unknown)=>void;
 const result=new Promise(resolve=>{reported=resolve;});
 const worker=new TransferExpirationWorker({async listExpirationCandidates(){return [];}},{async cleanupExpired(){return true;}});
 const stop=worker.start(1000,reported);
 await result;
 stop();
 assert.throws(()=>worker.start(0),/INVALID_EXPIRATION_INTERVAL/);
});

test("invalid scan bounds are rejected before querying",async()=>{
 const repository=new MemoryTransferStateRepository();
 await assert.rejects(repository.listExpirationCandidates(new Date(),0),/INVALID_EXPIRATION_BATCH/);
 await assert.rejects(repository.listExpirationCandidates(new Date("invalid"),100),/INVALID_EXPIRATION_BATCH/);
});
