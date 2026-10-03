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
