import assert from "node:assert/strict"; import test from "node:test";
import { MemoryStorage } from "../src/adapters/memory-storage.js";
import { TransferService } from "../src/services/transfer-service.js";
import { createHash } from "node:crypto";
test("expired transfer purges its private stored bytes",async()=>{const storage=new MemoryStorage();const service=new TransferService(storage);const data=Buffer.from("private-expiring-data");const s=service.create({fileName:"a.bin",contentType:"application/octet-stream",totalBytes:data.length,chunkBytes:data.length,originalSha256:createHash("sha256").update(data).digest("hex"),senderExpirationConfirmed:true});await service.uploadPart(s.id,1,data);s.uploadExpiresAt=new Date(Date.now()-1);assert.equal(await service.expireIfNeeded(s.id),true);await assert.rejects(()=>storage.readPart(s.id,1),/TRANSFER_NOT_READY|PART_NOT_FOUND/);});
