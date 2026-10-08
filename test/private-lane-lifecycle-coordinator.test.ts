import assert from "node:assert/strict";
import test from "node:test";
import { MemoryTransferKeyVault, TransferCryptoContextService } from "../src/security/transfer-crypto-context.js";
import { PrivateLaneLifecycleCoordinator } from "../src/security/private-lane-lifecycle-coordinator.js";

test("every send receives a different private lane and crypto context",async()=>{
  const c=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService(new MemoryTransferKeyVault()));
  const a=await c.createForSend("t1");
  const b=await c.createForSend("t2");
  assert.notEqual(a.laneId,b.laneId);
  assert.notEqual(a.crypto.keyReference,b.crypto.keyReference);
});

test("one transfer cannot be assigned two active private lanes",async()=>{
  const c=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService(new MemoryTransferKeyVault()));
  await c.createForSend("t1");
  await assert.rejects(c.createForSend("t1"),/ALREADY_EXISTS/);
});

test("lane can move through recovery without changing identity",async()=>{
  const c=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService(new MemoryTransferKeyVault()));
  const original=await c.createForSend("t1");
  c.setStatus("t1","recovering");
  assert.equal(c.get("t1")?.laneId,original.laneId);
});


test("crypto lifecycle can bind to the canonical durable transfer lane",async()=>{
  const c=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService(new MemoryTransferKeyVault()));
  const lane=await c.createForSend("t-canonical","lane-canonical");
  assert.equal(lane.laneId,"lane-canonical");
  assert.equal(lane.crypto.laneId,"lane-canonical");
});


test("expiration retires the private crypto context and destroys its key",async()=>{
  const destroyed:string[]=[];
  const vault={
    async createKey(){ return "key-expiring"; },
    async destroyKey(reference:string){ destroyed.push(reference); }
  };
  const c=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService(vault));
  await c.createForSend("t-expiring","lane-expiring");
  await c.onExpired("t-expiring");
  assert.deepEqual(destroyed,["key-expiring"]);
  assert.equal(c.get("t-expiring")?.status,"retired");
});


test("crypto context exposes only an opaque key reference for durable state",async()=>{
  const c=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService(new MemoryTransferKeyVault()));
  const lane=await c.createForSend("t-durable-key","lane-durable-key");
  assert.match(lane.crypto.keyReference,/^dev-key-/);
  assert.equal("rawKey" in (lane.crypto as unknown as Record<string,unknown>),false);
});


test("restart rehydration reuses durable lane and key reference without creating a key",()=>{
  let creates=0;
  const vault={
    async createKey(){ creates++; return "unexpected-new-key"; },
    async destroyKey(){ }
  };
  const c=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService(vault));
  const restored=c.restoreFromReference("t-restart","lane-persisted","kms-ref-persisted","verified");
  assert.equal(creates,0);
  assert.equal(restored.laneId,"lane-persisted");
  assert.equal(restored.crypto.keyReference,"kms-ref-persisted");
  assert.equal(restored.status,"verified");
});

test("restart rehydration fails closed without a durable key reference",()=>{
  const vault={async createKey(){ return "unused"; },async destroyKey(){}};
  const c=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService(vault));
  assert.throws(()=>c.restoreFromReference("t-missing","lane-persisted",""),/TRANSFER_CRYPTO_REFERENCE_REQUIRED/);
});


function deferred(){
 let resolve!:()=>void;
 const promise=new Promise<void>(done=>{resolve=done;});
 return {promise,resolve};
}

test("overlapping creation allocates only one key and blocks competing restore",async()=>{
 const gate=deferred();let creates=0;
 const c=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService({
  async createKey(){creates++;await gate.promise;return "original-key";},async destroyKey(){}
 }));
 const first=c.createForSend("t","lane");
 await assert.rejects(c.createForSend("t","other-lane"),/PRIVATE_LANE_ALREADY_EXISTS/);
 assert.throws(()=>c.restoreFromReference("t","other-lane","other-key"),/PRIVATE_LANE_CREATION_IN_PROGRESS/);
 gate.resolve();
 const created=await first;
 assert.equal(creates,1);assert.equal(created.crypto.keyReference,"original-key");
});

test("failed creation releases its reservation so a retry can succeed",async()=>{
 let creates=0;
 const c=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService({
  async createKey(){if(++creates===1)throw new Error("VAULT_OFFLINE");return "retry-key";},async destroyKey(){}
 }));
 await assert.rejects(c.createForSend("t","lane"),/VAULT_OFFLINE/);
 assert.equal(c.get("t"),undefined);
 assert.equal((await c.createForSend("t","lane")).crypto.keyReference,"retry-key");
});

test("restore rejects mismatched lane or key and preserves the original context",async()=>{
 const c=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService(new MemoryTransferKeyVault()));
 const original=await c.createForSend("t","lane");
 assert.throws(()=>c.restoreFromReference("t","different-lane",original.crypto.keyReference),/TRANSFER_CRYPTO_IDENTITY_MISMATCH/);
 assert.throws(()=>c.restoreFromReference("t","lane","different-key"),/TRANSFER_CRYPTO_IDENTITY_MISMATCH/);
 assert.deepEqual(c.restoreFromReference("t","lane",original.crypto.keyReference),original);
 assert.deepEqual(c.get("t"),original);
});

test("overlapping expiration destroys the key only once",async()=>{
 const entered=deferred(),gate=deferred();let destroys=0;
 const c=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService({
  async createKey(){return "key";},async destroyKey(){destroys++;entered.resolve();await gate.promise;}
 }));
 await c.createForSend("t","lane");
 const first=c.onExpired("t");await entered.promise;
 const second=c.onExpired("t");
 gate.resolve();await Promise.all([first,second]);
 assert.equal(destroys,1);assert.equal(c.get("t")?.status,"retired");
});

test("failed shared retirement can be retried without creating another key",async()=>{
 const entered=deferred(),gate=deferred();let destroys=0;
 const c=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService({
  async createKey(){return "key";},async destroyKey(){if(++destroys===1){entered.resolve();await gate.promise;throw new Error("VAULT_OFFLINE");}}
 }));
 await c.createForSend("t","lane");
 const first=c.onExpired("t");await entered.promise;
 const second=c.onExpired("t");
 const checked=Promise.all([assert.rejects(first,/VAULT_OFFLINE/),assert.rejects(second,/VAULT_OFFLINE/)]);
 gate.resolve();await checked;
 assert.equal(destroys,1);assert.equal(c.get("t")?.status,"expired");
 await c.onExpired("t");
 assert.equal(destroys,2);assert.equal(c.get("t")?.status,"retired");
});

test("expiration waits for pending creation and retires its resulting key",async()=>{
 const gate=deferred();const destroyed:string[]=[];
 const c=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService({
  async createKey(){await gate.promise;return "pending-key";},async destroyKey(key){destroyed.push(key);}
 }));
 const creating=c.createForSend("t","lane");
 const expiring=c.onExpired("t");
 gate.resolve();await Promise.all([creating,expiring]);
 assert.deepEqual(destroyed,["pending-key"]);assert.equal(c.get("t")?.status,"retired");
});

test("expiration rejects conflicting persisted identity before destroying a key",async()=>{
 const destroyed:string[]=[];
 const c=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService({
  async createKey(){return "local-key";},async destroyKey(key){destroyed.push(key);}
 }));
 await c.createForSend("t","lane");
 await assert.rejects(c.onExpired("t",{laneId:"other-lane",keyReference:"persisted-key"}),/TRANSFER_CRYPTO_IDENTITY_MISMATCH/);
 assert.deepEqual(destroyed,[]);assert.equal(c.get("t")?.status,"active");
});


test("retired context cannot be reactivated by status or restore",async()=>{
 const c=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService(new MemoryTransferKeyVault()));
 const original=await c.createForSend("t","lane");await c.retire("t");
 for(const status of ["active","recovering","verified"] as const){
  assert.throws(()=>c.setStatus("t",status),/PRIVATE_LANE_RETIRED/);
  assert.throws(()=>c.restoreFromReference("t","lane",original.crypto.keyReference,status),/PRIVATE_LANE_RETIRED/);
 }
 c.setStatus("t","retired");
 assert.equal(c.get("t")?.status,"retired");
 await c.onExpired("t",{laneId:"lane",keyReference:original.crypto.keyReference});
 assert.equal(c.get("t")?.status,"retired");
});

test("expired context cannot resume but can still retire",async()=>{
 const c=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService(new MemoryTransferKeyVault()));
 const original=await c.createForSend("t","lane");c.setStatus("t","expired");
 for(const status of ["active","recovering","verified"] as const){
  assert.throws(()=>c.setStatus("t",status),/PRIVATE_LANE_EXPIRED/);
  assert.throws(()=>c.restoreFromReference("t","lane",original.crypto.keyReference,status),/PRIVATE_LANE_EXPIRED/);
 }
 c.setStatus("t","expired");await c.retire("t");
 assert.equal(c.get("t")?.status,"retired");
});

test("status setter cannot skip key destruction by marking a context retired",async()=>{
 const destroyed:string[]=[];
 const c=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService({
  async createKey(){return "key";},async destroyKey(key){destroyed.push(key);}
 }));
 await c.createForSend("t","lane");
 assert.throws(()=>c.setStatus("t","retired"),/PRIVATE_LANE_RETIREMENT_REQUIRED/);
 assert.throws(()=>c.restoreFromReference("t","lane","key","retired"),/PRIVATE_LANE_RETIREMENT_REQUIRED/);
 assert.equal(c.get("t")?.status,"active");
 await c.retire("t");assert.deepEqual(destroyed,["key"]);
});

test("restore cannot declare an unverified retirement without destroying the key",async()=>{
 const destroyed:string[]=[];
 const c=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService({
  async createKey(){throw new Error("MUST_NOT_CREATE");},async destroyKey(key){destroyed.push(key);}
 }));
 assert.throws(()=>c.restoreFromReference("t","lane","key","retired"),/PRIVATE_LANE_RETIREMENT_REQUIRED/);
 assert.equal(c.get("t"),undefined);
 c.restoreFromReference("t","lane","key","expired");
 await c.retire("t");assert.deepEqual(destroyed,["key"]);
});

test("direct retirement blocks active status while key destruction is pending",async()=>{
 const entered=deferred(),gate=deferred();
 const c=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService({
  async createKey(){return "key";},async destroyKey(){entered.resolve();await gate.promise;}
 }));
 await c.createForSend("t","lane");const retiring=c.retire("t");await entered.promise;
 assert.equal(c.get("t")?.status,"expired");
 assert.throws(()=>c.setStatus("t","active"),/PRIVATE_LANE_EXPIRED/);
 assert.throws(()=>c.restoreFromReference("t","lane","key","active"),/PRIVATE_LANE_EXPIRED/);
 gate.resolve();await retiring;assert.equal(c.get("t")?.status,"retired");
});

test("failed direct retirement stays expired until destruction succeeds",async()=>{
 let attempts=0;
 const c=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService({
  async createKey(){return "key";},async destroyKey(){if(++attempts===1)throw new Error("VAULT_OFFLINE");}
 }));
 await c.createForSend("t","lane");
 await assert.rejects(c.retire("t"),/VAULT_OFFLINE/);
 assert.equal(c.get("t")?.status,"expired");
 assert.throws(()=>c.setStatus("t","verified"),/PRIVATE_LANE_EXPIRED/);
 await c.retire("t");assert.equal(c.get("t")?.status,"retired");assert.equal(attempts,2);
});
