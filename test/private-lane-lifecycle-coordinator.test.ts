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
