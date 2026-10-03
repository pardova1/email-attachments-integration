import assert from "node:assert/strict";
import test from "node:test";
import { MemoryTransferKeyVault, TransferCryptoContextService } from "../src/security/transfer-crypto-context.js";

test("separate email sends receive separate key references",async()=>{
  const service=new TransferCryptoContextService(new MemoryTransferKeyVault());
  const a=await service.create("t1","l1");
  const b=await service.create("t2","l2");
  assert.notEqual(a.keyReference,b.keyReference);
  assert.equal(a.encryptionScope,"single-transfer");
  assert.equal(b.encryptionScope,"single-transfer");
});

test("crypto identity requires both transfer and lane",async()=>{
  const service=new TransferCryptoContextService(new MemoryTransferKeyVault());
  await assert.rejects(service.create("","l1"),/IDENTITY_REQUIRED/);
});
