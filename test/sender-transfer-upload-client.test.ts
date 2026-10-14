import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {SenderTransferClient,SenderTransferClientError} from "../src/client/sender-transfer-client.js";
const api="https://app.example/v1/transfers",id="11111111-1111-4111-8111-111111111111",original=Buffer.from([0,255,1,2]);
const hash=(data:Uint8Array)=>createHash("sha256").update(data).digest("hex");
const input={fileName:"opaque.bin",contentType:"application/octet-stream",totalBytes:original.length,chunkBytes:2,originalSha256:hash(original),senderExpirationConfirmed:true as const};
const token=(scope:string,expiry:string)=>`${Buffer.from(JSON.stringify({transferId:id,scope,exp:Math.floor(Date.parse(expiry)/1000)})).toString("base64url")}.signature`;
const created=()=>{const expiry=new Date(Date.now()+60000).toISOString();return {id,chunkBytes:2,uploadExpiresAt:expiry,uploadToken:token("upload",expiry),senderNotice:"expiry",recipientNotice:"expiry",uploadPartUrlTemplate:`/v1/transfers/${id}/parts/{partNumber}`};};
const completed=()=>{const available=new Date().toISOString(),expiry=new Date(Date.parse(available)+4*60*60*1000).toISOString();return {objectKey:"opaque-key",sha256:input.originalSha256,totalBytes:4,status:"complete",verifiedExact:true,downloadAvailableAt:available,downloadExpiresAt:expiry,recipientNotice:"expiry",recipientAccess:`/v1/transfers/${id}/download?token=${token("download",expiry)}`};};
const json=(value:unknown,status=200)=>Response.json(value,{status});
const code=(expected:string)=>(error:unknown)=>error instanceof SenderTransferClientError&&error.code===expected;
function session(){let account:string|undefined="a";const listeners=new Set<()=>void>();return {currentCustomer:()=>account,async accessToken(){return "session-token";},subscribe(fn:()=>void){listeners.add(fn);return ()=>listeners.delete(fn);},change(value:string|undefined){account=value;for(const fn of listeners)fn();},listeners};}
async function fixture(next:(url:string,init:RequestInit)=>Promise<Response>){const auth=session();let calls=0;const client=new SenderTransferClient(api,auth,async(url,init)=>{if(init?.method==="POST"&&String(url)===api)return json(created(),201);calls++;return next(String(url),init!);});const transfer=await client.create(input);return {client,auth,transfer,get calls(){return calls;}};}
test("upload sends opaque chunk bytes and SHA-256 with its own transfer token",async()=>{
 const f=await fixture(async(url,init)=>{assert.equal(url,`${api}/${id}/parts/1`);assert.equal(init.method,"PUT");assert.equal(init.credentials,"omit");assert.equal(init.redirect,"error");const headers=new Headers(init.headers);assert.equal(headers.get("authorization"),`Bearer ${f.transfer.uploadToken}`);assert.notEqual(headers.get("authorization"),"Bearer session-token");assert.equal(headers.get("x-content-sha256"),hash(original.subarray(0,2)));assert.deepEqual(new Uint8Array(init.body as Uint8Array),new Uint8Array(original.subarray(0,2)));return json({receivedParts:1,totalParts:2,percent:50,checksumVerified:true});});
 try{assert.equal((await f.client.uploadPart(f.transfer,1,new Blob([original.subarray(0,2)]))).percent,50);}finally{f.client.dispose();}
});
test("foreign copied altered expired and incorrectly sized capabilities never upload",async()=>{
 const f=await fixture(async()=>{throw new Error("UNEXPECTED");});const now=Date.now;
 try{
  for(const [part,blob] of [[0,new Blob(["xx"])],[3,new Blob(["xx"])],[1,new Blob(["x"])]] as const)await assert.rejects(f.client.uploadPart(f.transfer,part,blob),code("INVALID_PART"));
  await assert.rejects(f.client.uploadPart({...f.transfer},1,new Blob(["xx"])),code("TRANSFER_NOT_OWNED"));
  const second=new SenderTransferClient(api,session());try{await assert.rejects(second.uploadPart(f.transfer,1,new Blob(["xx"])),code("TRANSFER_NOT_OWNED"));}finally{second.dispose();}
  const saved=f.transfer.uploadToken;f.transfer.uploadToken="other.signature";await assert.rejects(f.client.uploadPart(f.transfer,1,new Blob(["xx"])),code("TRANSFER_NOT_OWNED"));f.transfer.uploadToken=saved;
  Date.now=()=>now()+120000;await assert.rejects(f.client.uploadPart(f.transfer,1,new Blob(["xx"])),code("UPLOAD_EXPIRED"));assert.equal(f.calls,0);
 }finally{Date.now=now;f.client.dispose();}
});
test("account change during file reading blocks hash/upload and returning to account cannot revive capability",async()=>{
 const f=await fixture(async()=>{throw new Error("UNEXPECTED");});let entered!:()=>void,release!:(value:ArrayBuffer)=>void;const started=new Promise<void>(done=>{entered=done;});const blob=new Blob([original.subarray(0,2)]);blob.arrayBuffer=async()=>{entered();return new Promise<ArrayBuffer>(done=>{release=done;});};
 try{const pending=f.client.uploadPart(f.transfer,1,blob);await started;f.auth.change("b");await assert.rejects(pending,code("ACCOUNT_CHANGED"));release(new ArrayBuffer(2));await new Promise(done=>setImmediate(done));assert.equal(f.calls,0);f.auth.change("a");await assert.rejects(f.client.uploadPart(f.transfer,1,new Blob(["xx"])),code("ACCOUNT_CHANGED"));}finally{f.client.dispose();}
});
test("completion requires exact original hash byte count window and transfer-bound download link",async()=>{
 for(const changed of [{sha256:"a".repeat(64)},{totalBytes:3},{verifiedExact:false},{recipientAccess:"https://evil.example/download"},{recipientAccess:`/v1/transfers/${id}/download?token=bad`},{downloadExpiresAt:new Date(Date.now()+100000).toISOString()}]){const f=await fixture(async()=>json({...completed(),...changed}));try{await assert.rejects(f.client.complete(f.transfer),code("INVALID_RESPONSE"));}finally{f.client.dispose();}}
 const f=await fixture(async(url,init)=>{assert.equal(url,`${api}/${id}/complete`);assert.equal(init.method,"POST");assert.equal(init.body,undefined);return json(completed());});
 try{assert.equal((await f.client.complete(f.transfer)).verifiedExact,true);await assert.rejects(f.client.uploadPart(f.transfer,1,new Blob(["xx"])),code("TRANSFER_ALREADY_COMPLETE"));}finally{f.client.dispose();}
});
test("invalid progress and unverified chunks never become successful acknowledgements",async()=>{
 for(const value of [{receivedParts:1,totalParts:2,percent:50,checksumVerified:false},{receivedParts:3,totalParts:2,percent:100,checksumVerified:true},{receivedParts:1,totalParts:99,percent:1,checksumVerified:true},{receivedParts:1,totalParts:2,percent:100,checksumVerified:true}]){const f=await fixture(async()=>json(value));try{await assert.rejects(f.client.uploadPart(f.transfer,1,new Blob(["xx"])),code("INVALID_RESPONSE"));}finally{f.client.dispose();}}
});
test("failed upload/completion does not automatically retry and overlapping work is blocked",async()=>{
 const f=await fixture(async()=>json({error:"PRIVATE"},503));try{await assert.rejects(f.client.uploadPart(f.transfer,1,new Blob(["xx"])),code("TRANSFER_UNAVAILABLE"));assert.equal(f.calls,1);}finally{f.client.dispose();}
 const g=await fixture(async()=>json({error:"PRIVATE"},409));try{await assert.rejects(g.client.complete(g.transfer),code("COMPLETION_REJECTED"));assert.equal(g.calls,1);}finally{g.client.dispose();}
 const h=await fixture(async()=>new Promise(()=>{}));const pending=h.client.complete(h.transfer);await new Promise(done=>setImmediate(done));await assert.rejects(h.client.uploadPart(h.transfer,1,new Blob(["xx"])),code("TRANSFER_BUSY"));h.client.dispose();await assert.rejects(pending,code("CLIENT_DISPOSED"));assert.equal(h.auth.listeners.size,0);
});

test("chunk reading transport and body parsing are bounded and late replies are discarded",async()=>{
 for(const stage of ["read","transport","body"]){const auth=session();let calls=0,cancelled=false;const client=new SenderTransferClient(api,auth,async(url)=>{if(String(url)===api)return json(created(),201);calls++;return stage==="transport"?new Promise(()=>{}):new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{"content-type":"application/json"}});},30);
  try{const capability=await client.create(input),blob=new Blob(["xx"]);if(stage==="read")blob.arrayBuffer=async()=>new Promise(()=>{});await assert.rejects(client.uploadPart(capability,1,blob),code("TRANSFER_UNAVAILABLE"));assert.equal(calls,stage==="read"?0:1);if(stage==="body")assert.equal(cancelled,true);}finally{client.dispose();}
 }
 const auth=session();let entered!:()=>void,release!:(response:Response)=>void,cancelled=false;const started=new Promise<void>(done=>{entered=done;});const client=new SenderTransferClient(api,auth,async(url)=>{if(String(url)===api)return json(created(),201);entered();return new Promise<Response>(done=>{release=done;});});
 try{const capability=await client.create(input),pending=client.complete(capability);await started;auth.change(undefined);await assert.rejects(pending,code("ACCOUNT_CHANGED"));release(new Response(new ReadableStream({cancel(){cancelled=true;}})));await new Promise(done=>setImmediate(done));assert.equal(cancelled,true);}finally{client.dispose();}
});
test("browser create upload and completion preserve exact bytes against real HTTP storage services",async()=>{
 const [{default:express},{MemoryStorage},{TransferService},{SenderTransferAccessService,requireSenderTransferAccess},{RecipientAccessService},{requireChunkSha256}]=await Promise.all([import("express"),import("../src/adapters/memory-storage.js"),import("../src/services/transfer-service.js"),import("../src/services/sender-transfer-access.js"),import("../src/services/recipient-access.js"),import("../src/services/chunk-integrity-gate.js")]);
 const storage=new MemoryStorage(),service=new TransferService(storage),access=new SenderTransferAccessService("synthetic-secret"),recipients=new RecipientAccessService("synthetic-secret"),app=express();app.use(express.json());
 app.post("/v1/transfers",(req,res)=>{assert.equal(req.header("authorization"),"Bearer session-token");const transfer=service.create(req.body);res.status(201).json({id:transfer.id,chunkBytes:transfer.chunkBytes,uploadExpiresAt:transfer.uploadExpiresAt,uploadToken:access.issue(transfer.id,transfer.uploadExpiresAt),senderNotice:"expiry",recipientNotice:"expiry",uploadPartUrlTemplate:`/v1/transfers/${transfer.id}/parts/{partNumber}`});});
 app.put("/v1/transfers/:id/parts/:number",requireSenderTransferAccess(access),express.raw({type:"application/octet-stream"}),async(req,res)=>{requireChunkSha256(req.body,req.header("x-content-sha256"));res.json({...await service.uploadPart(String(req.params.id),Number(req.params.number),req.body),checksumVerified:true});});
 app.post("/v1/transfers/:id/complete",requireSenderTransferAccess(access),async(req,res)=>{const result=await service.complete(String(req.params.id));res.json({...result,recipientNotice:"expiry",recipientAccess:`/v1/transfers/${req.params.id}/download?token=${recipients.issue(String(req.params.id),result.downloadExpiresAt)}`});});
 const http=app.listen(0,"127.0.0.1");await new Promise<void>(done=>http.once("listening",done));const address=http.address();assert.ok(address&&typeof address!=="string");const client=new SenderTransferClient(api,session(),(url,init)=>fetch(`http://127.0.0.1:${address.port}${new URL(String(url)).pathname}`,init));
 try{const capability=await client.create(input);assert.equal((await client.uploadPart(capability,1,new Blob([original.subarray(0,2)]))).percent,50);assert.equal((await client.uploadPart(capability,2,new Blob([original.subarray(2)]))).percent,100);const result=await client.complete(capability);assert.equal(result.verifiedExact,true);assert.equal(result.sha256,input.originalSha256);assert.deepEqual(Buffer.concat([await storage.readPart(capability.id,1),await storage.readPart(capability.id,2)]),original);}finally{client.dispose();await new Promise<void>((resolve,reject)=>http.close(error=>error?reject(error):resolve()));}
});

test("malformed oversized and invalid UTF-8 upload replies stay private",async()=>{
 for(const response of [()=>new Response("{",{headers:{"content-type":"application/json"}}),()=>new Response(new Uint8Array([255]),{headers:{"content-type":"application/json"}}),()=>json({payload:"x".repeat(33000)})]){const f=await fixture(async()=>response());try{await assert.rejects(f.client.uploadPart(f.transfer,1,new Blob(["xx"])),code("INVALID_RESPONSE"));}finally{f.client.dispose();}}
});
