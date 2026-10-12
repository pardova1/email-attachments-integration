import assert from "node:assert/strict";
import test from "node:test";
import {randomBytes,createHash} from "node:crypto";
import {SupabaseTransferKeyVault} from "../src/adapters/supabase-transfer-key-vault.js";
import {createTransferKeyVault} from "../src/config/transfer-key-vault-factory.js";
import {TransferCryptoContextService} from "../src/security/transfer-crypto-context.js";
import {PrivateLaneLifecycleCoordinator} from "../src/security/private-lane-lifecycle-coordinator.js";
import {TransferService} from "../src/services/transfer-service.js";
import {MemoryStorage} from "../src/adapters/memory-storage.js";
import {MemoryTransferStateRepository} from "../src/adapters/memory-transfer-state-repository.js";
function fixture(){
 const rows=new Map<string,any>(),wrappingKey=randomBytes(32).toString("base64");let unavailable=false;
 const request:typeof fetch=async(url,init)=>{
  if(unavailable)throw new Error("PRIVATE_DATABASE_CREDENTIALS");
  const u=new URL(String(url));assert.equal(u.origin,"https://db.example");assert.equal(init?.redirect,"error");
  if(init?.method==="POST"){const row=JSON.parse(String(init.body));assert.equal(rows.has(row.key_reference),false);rows.set(row.key_reference,row);return new Response(null,{status:201});}
  const reference=u.searchParams.get("key_reference")!.slice(3),row=rows.get(reference);
  if(init?.method==="PATCH"){if(row&&row.retired_at===null)Object.assign(row,JSON.parse(String(init.body)));return new Response(null,{status:204});}
  return Response.json(row?[structuredClone(row)]:[]);
 };
 const config={url:"https://db.example",secretKey:"private-service-key",wrappingKey,fetch:request};
 return {rows,config,vault:()=>new SupabaseTransferKeyVault(config),fail(){unavailable=true;}};
}
test("encrypted transfer keys survive replacement, remain scoped, and retire idempotently",async()=>{
 const f=fixture(),scope={transferId:"t",laneId:"l"},first=f.vault(),reference=await first.createKey(scope),second=await first.createKey(scope);
 assert.notEqual(reference,second);const row=f.rows.get(reference);assert.equal(row.ciphertext.length,64);assert.notEqual(row.ciphertext,f.rows.get(second).ciphertext);
 assert.equal(JSON.stringify(row).includes(f.config.wrappingKey),false);
 await f.vault().assertKeyScope(reference,scope);
 await assert.rejects(f.vault().assertKeyScope(reference,{transferId:"other",laneId:"l"}),/TRANSFER_KEY_UNAVAILABLE/);
 await assert.rejects(f.vault().assertKeyScope(reference,{transferId:"t",laneId:"other"}),/TRANSFER_KEY_UNAVAILABLE/);
 await f.vault().destroyKey(reference);await f.vault().destroyKey(reference);
 assert.equal(row.ciphertext,null);assert.equal(row.nonce,null);assert.equal(row.auth_tag,null);
 await assert.rejects(f.vault().assertKeyScope(reference,scope),/TRANSFER_KEY_UNAVAILABLE/);
 await f.vault().assertKeyScope(second,scope);
});
test("tampered metadata, ciphertext, missing records, and wrong wrapping secrets fail closed",async()=>{
 for(const field of ["ciphertext","auth_tag","nonce","transfer_id","key_reference"]){
  const f=fixture(),scope={transferId:"t",laneId:"l"},reference=await f.vault().createKey(scope),row=f.rows.get(reference);
  row[field]=field==="transfer_id"?"other":field==="key_reference"?"other":(row[field][0]==="0"?"1":"0")+row[field].slice(1);
  await assert.rejects(f.vault().assertKeyScope(reference,scope),/TRANSFER_KEY_UNAVAILABLE/);
 }
 const f=fixture(),reference=await f.vault().createKey({transferId:"t",laneId:"l"});
 await assert.rejects(new SupabaseTransferKeyVault({...f.config,wrappingKey:randomBytes(32).toString("base64")}).assertKeyScope(reference,{transferId:"t",laneId:"l"}),/TRANSFER_KEY_UNAVAILABLE/);
 f.rows.clear();await assert.rejects(f.vault().assertKeyScope(reference,{transferId:"t",laneId:"l"}),/TRANSFER_KEY_UNAVAILABLE/);
 await assert.rejects(f.vault().destroyKey("../../other"),/TRANSFER_KEY_REFERENCE_INVALID/);
});
test("vault failures are private and never return a key reference for failed persistence",async()=>{
 const f=fixture();f.fail();await assert.rejects(f.vault().createKey({transferId:"t",laneId:"l"}),{message:"TRANSFER_KEY_VAULT_UNAVAILABLE"});
});
test("production envelope vault requires explicit configuration and canonical wrapping secret",()=>{
 const env={NODE_ENV:"production",TRANSFER_KEY_VAULT_PROVIDER:"supabase-envelope",SUPABASE_URL:"https://db.example",SUPABASE_SECRET_KEY:"service-secret",TRANSFER_KEY_WRAPPING_SECRET:randomBytes(32).toString("base64")};
 assert.ok(createTransferKeyVault(env) instanceof SupabaseTransferKeyVault);
 for(const change of [{TRANSFER_KEY_WRAPPING_SECRET:""},{TRANSFER_KEY_WRAPPING_SECRET:"change-me"},{SUPABASE_URL:"http://db.example"},{TRANSFER_KEY_VAULT_PROVIDER:"unknown"}])assert.throws(()=>createTransferKeyVault({...env,...change}));
});
test("restart validates durable keys before publishing transfer state; missing keys keep it unloaded",async()=>{
 const f=fixture(),storage=new MemoryStorage(),repository=new MemoryTransferStateRepository();
 const first=new TransferService(storage,undefined,repository),transfer=await first.createDurable({fileName:"restart.bin",contentType:"application/octet-stream",totalBytes:1,chunkBytes:1,originalSha256:createHash("sha256").update("x").digest("hex"),senderExpirationConfirmed:true});
 const laneId=first.lane(transfer.id).laneId,reference=await f.vault().createKey({transferId:transfer.id,laneId});await first.persistKeyReference(transfer.id,reference);
 const restart=()=>{const lanes=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService(f.vault()));return new TransferService(storage,undefined,repository,undefined,{async onRestored(state){await lanes.restoreVerifiedReference(state.transferId,state.laneId,state.keyReference!);}});};
 const second=restart();await second.restore(transfer.id);assert.equal(second.lane(transfer.id).laneId,laneId);assert.equal(second.get(transfer.id).uploadExpiresAt.toISOString(),transfer.uploadExpiresAt.toISOString());
 await second.uploadPart(transfer.id,1,Buffer.from("x"));assert.equal((await second.complete(transfer.id)).verifiedExact,true);
 await f.vault().destroyKey(reference);const third=restart();await assert.rejects(third.restore(transfer.id),/TRANSFER_KEY_UNAVAILABLE/);assert.throws(()=>third.get(transfer.id),/TRANSFER_NOT_LOADED/);
});
