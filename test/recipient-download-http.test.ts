import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import express from "express";
import { createHash } from "node:crypto";
import { get as httpGet } from "node:http";
import { MemoryStorage } from "../src/adapters/memory-storage.js";
import { TransferService } from "../src/services/transfer-service.js";
import { RecipientAccessService } from "../src/services/recipient-access.js";
import { VerifiedDownloadService } from "../src/services/verified-download-service.js";
import { createRecipientDownloadHandler } from "../src/http/recipient-download-handler.js";
import { PUBLIC_TECHNICAL_DIFFICULTIES_NOTICE } from "../src/incidents/public-incident-notification.js";

async function fixture(t: TestContext) {
 const bytes=Buffer.from("abcdef"),storage=new MemoryStorage(),service=new TransferService(storage);
 const transfer=service.create({fileName:"test.bin",contentType:"application/octet-stream",totalBytes:6,chunkBytes:2,originalSha256:createHash("sha256").update(bytes).digest("hex"),senderExpirationConfirmed:true});
 for(let n=1;n<=3;n++)await service.uploadPart(transfer.id,n,bytes.subarray((n-1)*2,n*2));
 await service.complete(transfer.id);
 const access=new RecipientAccessService("test-secret");
 const token=access.issue(transfer.id,transfer.downloadExpiresAt!);
 const app=express();
 let closed!:()=>void;
 const disconnected=new Promise<void>(resolve=>{closed=resolve;});
 app.use((_req,res,next)=>{res.once("close",closed);next();});
 app.get("/transfers/:id/download",createRecipientDownloadHandler(service,access,new VerifiedDownloadService(storage)));
 const server=app.listen(0);
 await new Promise<void>(resolve=>server.once("listening",resolve));
 const address=server.address();assert.ok(address && typeof address==="object");
 t.after(()=>{server.closeAllConnections();server.close();});
 return {storage,service,transfer,disconnected,url:`http://127.0.0.1:${address.port}/transfers/${transfer.id}/download?token=${token}`};
}

test("verified recipient response sends exact bytes and length",async(t)=>{
 const {url}=await fixture(t);
 const response=await fetch(url);
 assert.equal(response.status,200);assert.equal(response.headers.get("content-length"),"6");
 assert.equal(await response.text(),"abcdef");
});

test("preflight verification failure returns JSON before attachment headers",async(t)=>{
 const {storage,url}=await fixture(t);
 storage.readPart=async()=>Buffer.from("zz");
 const response=await fetch(url);
 assert.equal(response.status,403);assert.equal(response.headers.get("content-disposition"),null);
 assert.deepEqual(await response.json(),{error:PUBLIC_TECHNICAL_DIFFICULTIES_NOTICE});
});

test("expiration during verification blocks all file bytes",async(t)=>{
 const {storage,transfer,url}=await fixture(t);
 const original=storage.readPart.bind(storage);
 storage.readPart=async(id,part)=>{const bytes=await original(id,part);transfer.downloadExpiresAt=new Date(Date.now()-1);return bytes;};
 const response=await fetch(url);
 assert.equal(response.status,403);assert.equal(response.headers.get("content-disposition"),null);
 assert.deepEqual(await response.json(),{error:PUBLIC_TECHNICAL_DIFFICULTIES_NOTICE});
});

test("storage failure after first bytes closes the response without appending JSON",async(t)=>{
 const {storage,url}=await fixture(t);
 const original=storage.readPart.bind(storage);let reads=0,release!:()=>void;
 const ready=new Promise<void>(resolve=>{release=resolve;});
 storage.readPart=async(id,part)=>{if(++reads===5){await ready;throw new Error("STORAGE_FAILED");}return original(id,part);};
 const response=await fetch(url);
 assert.equal(response.status,200);
 const reader=response.body!.getReader();
 const first=await reader.read();assert.equal(Buffer.from(first.value!).toString(),"ab");
 release();
 await assert.rejects(reader.read());
});

test("client disconnect during verification stops subsequent storage reads",async(t)=>{
 const {storage,url,disconnected}=await fixture(t);
 const original=storage.readPart.bind(storage);let reads=0,entered!:()=>void,release!:()=>void;
 const started=new Promise<void>(resolve=>{entered=resolve;});
 const ready=new Promise<void>(resolve=>{release=resolve;});
 storage.readPart=async(id,part)=>{reads++;if(reads===2){entered();await ready;}return original(id,part);};
 const request=httpGet(url);request.on("error",()=>{});
 await started;request.destroy();await disconnected;release();
 // An event-loop turn allows the suspended read to finish and observe cancellation.
 await new Promise<void>(resolve=>setImmediate(resolve));
 assert.equal(reads,2);
});

test("client disconnect after delivery starts cancels further chunk reads",async(t)=>{
 const {storage,url,disconnected}=await fixture(t);
 const original=storage.readPart.bind(storage);let reads=0,release!:()=>void,received!:()=>void;
 const ready=new Promise<void>(resolve=>{release=resolve;});
 const firstByte=new Promise<void>(resolve=>{received=resolve;});
 storage.readPart=async(id,part)=>{if(++reads===5)await ready;return original(id,part);};
 const request=httpGet(url,response=>{
  response.once("data",()=>{received();request.destroy();});response.on("error",()=>{});
 });request.on("error",()=>{});
 await firstByte;await disconnected;release();
 await new Promise<void>(resolve=>setImmediate(resolve));
 assert.equal(reads,5);
});
