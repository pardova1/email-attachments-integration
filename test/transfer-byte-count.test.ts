import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createTransfer, MAX_CHUNK_BYTES } from "../src/domain/transfer.js";
import { MemoryStorage } from "../src/adapters/memory-storage.js";
import { TransferService } from "../src/services/transfer-service.js";
import { VerifiedDownloadService } from "../src/services/verified-download-service.js";

const hash=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
const base={fileName:"a.bin",contentType:"application/octet-stream",totalBytes:5,chunkBytes:2,originalSha256:hash(Buffer.from("abcde")),senderExpirationConfirmed:true};

test("transfer sizes must be positive safe integers with a supported chunk size",()=>{
 for(const totalBytes of [NaN,Infinity,0,-1,1.5,Number.MAX_SAFE_INTEGER+1]){
  assert.throws(()=>createTransfer({...base,totalBytes}),/TRANSFER_SIZE_NOT_SUPPORTED/);
 }
 for(const chunkBytes of [NaN,Infinity,0,-1,1.5,MAX_CHUNK_BYTES+1]){
  assert.throws(()=>createTransfer({...base,chunkBytes}),/INVALID_CHUNK_SIZE/);
 }
 assert.equal(createTransfer({...base,chunkBytes:MAX_CHUNK_BYTES}).chunkBytes,MAX_CHUNK_BYTES);
});

test("wrong-sized parts are rejected before storage or progress mutation",async()=>{
 const storage=new MemoryStorage();let writes=0;
 const original=storage.putPart.bind(storage);
 storage.putPart=async(id,part,data)=>{writes++;await original(id,part,data);};
 const service=new TransferService(storage),transfer=service.create(base);
 for(const [part,data] of [[1,Buffer.from("a")],[1,Buffer.from("abc")],[3,Buffer.from("de")],[3,Buffer.alloc(0)]] as const){
  await assert.rejects(service.uploadPart(transfer.id,part,data),/INVALID_PART_SIZE/);
 }
 assert.equal(writes,0);assert.equal(service.status(transfer.id).receivedParts,0);
 await service.uploadPart(transfer.id,1,Buffer.from("ab"));
 await service.uploadPart(transfer.id,2,Buffer.from("cd"));
 await service.uploadPart(transfer.id,3,Buffer.from("e"));
 const completed=await service.complete(transfer.id);
 assert.equal(completed.totalBytes,5);assert.equal(completed.verifiedExact,true);
});

test("matching hash with incorrect stored byte count cannot start a download window",async()=>{
 const storage=new MemoryStorage();
 const original=storage.complete.bind(storage);
 storage.complete=async(id,parts)=>({...await original(id,parts),totalBytes:6});
 const service=new TransferService(storage),transfer=service.create({...base,chunkBytes:5});
 await service.uploadPart(transfer.id,1,Buffer.from("abcde"));
 await assert.rejects(service.complete(transfer.id),/FILE_INTEGRITY_COMMAND_VIOLATION/);
 assert.equal(transfer.downloadAvailableAt,null);assert.equal(transfer.downloadExpiresAt,null);
 assert.equal(service.integrityViolations(transfer.id)[0]?.type,"INTEGRITY-SIZE-MISMATCH");
});

test("download byte-count mismatch emits no file bytes even when the hash matches",async()=>{
 const storage=new MemoryStorage(),bytes=Buffer.from("abcde");
 await storage.putPart("t",1,bytes);await storage.complete("t",1);
 const emitted:Buffer[]=[];
 await assert.rejects(async()=>{
  for await(const part of new VerifiedDownloadService(storage).streamVerified("t",1,hash(bytes),6))emitted.push(part);
 },/FILE_INTEGRITY_COMMAND_VIOLATION/);
 assert.equal(emitted.length,0);
});
