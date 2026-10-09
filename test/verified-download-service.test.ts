import assert from "node:assert/strict"; import test from "node:test"; import { createHash } from "node:crypto";
import { MemoryStorage } from "../src/adapters/memory-storage.js"; import { VerifiedDownloadService } from "../src/services/verified-download-service.js";
import { getEventListeners } from "node:events";
const h=(b:Buffer)=>createHash("sha256").update(b).digest("hex");
test("download-time verifier streams exact stored parts only after whole-file SHA matches",async()=>{const s=new MemoryStorage();await s.putPart("t",1,Buffer.from("abc"));await s.putPart("t",2,Buffer.from("def"));await s.complete("t",2);const parts:Buffer[]=[];for await(const p of new VerifiedDownloadService(s).streamVerified("t",2,h(Buffer.from("abcdef")),6))parts.push(p);assert.equal(Buffer.concat(parts).toString(),"abcdef");});
test("download-time verifier emits no bytes when stored file is corrupted",async()=>{const s=new MemoryStorage();await s.putPart("t",1,Buffer.from("altered"));await s.complete("t",1);const out:Buffer[]=[];await assert.rejects(async()=>{for await(const p of new VerifiedDownloadService(s).streamVerified("t",1,h(Buffer.from("original")),8))out.push(p);},/FILE_INTEGRITY_COMMAND_VIOLATION/);assert.equal(out.length,0);});
test("verification does not retain all parts before delivery",async()=>{const reads:number[]=[];const s=new MemoryStorage();await s.putPart("t",1,Buffer.from("a"));await s.putPart("t",2,Buffer.from("b"));await s.complete("t",2);const original=s.readPart.bind(s);s.readPart=async(id,n)=>{reads.push(n);return original(id,n);};const iterator=new VerifiedDownloadService(s).streamVerified("t",2,h(Buffer.from("ab")),2);const first=await iterator.next();assert.equal(first.value?.toString(),"a");assert.deepEqual(reads,[1,2,1]);});

test("first chunk changed after preflight emits no bytes",async()=>{
 const s=new MemoryStorage();await s.putPart("t",1,Buffer.from("ab"));await s.complete("t",1);
 const original=s.readPart.bind(s);let reads=0;
 s.readPart=async(id,n)=>++reads===2?Buffer.from("zz"):original(id,n);
 const emitted:Buffer[]=[];
 await assert.rejects(async()=>{for await(const part of new VerifiedDownloadService(s).streamVerified("t",1,h(Buffer.from("ab")),2))emitted.push(part);},/FILE_INTEGRITY_COMMAND_VIOLATION/);
 assert.equal(emitted.length,0);
});

test("later altered chunk is blocked after only earlier verified bytes were emitted",async()=>{
 const s=new MemoryStorage();await s.putPart("t",1,Buffer.from("ab"));await s.putPart("t",2,Buffer.from("cd"));await s.complete("t",2);
 const original=s.readPart.bind(s);let reads=0;
 s.readPart=async(id,n)=>++reads===4?Buffer.from("zz"):original(id,n);
 const emitted:Buffer[]=[];
 await assert.rejects(async()=>{for await(const part of new VerifiedDownloadService(s).streamVerified("t",2,h(Buffer.from("abcd")),4))emitted.push(part);},/FILE_INTEGRITY_COMMAND_VIOLATION/);
 assert.equal(Buffer.concat(emitted).toString(),"ab");
});

test("changed delivery chunk length is rejected",async()=>{
 const s=new MemoryStorage();await s.putPart("t",1,Buffer.from("ab"));await s.complete("t",1);
 const original=s.readPart.bind(s);let reads=0;
 s.readPart=async(id,n)=>++reads===2?Buffer.from("abc"):original(id,n);
 await assert.rejects(new VerifiedDownloadService(s).streamVerified("t",1,h(Buffer.from("ab")),2).next(),/FILE_INTEGRITY_COMMAND_VIOLATION/);
});

test("delivery owns a snapshot instead of exposing an adapter's mutable buffer",async()=>{
 const s=new MemoryStorage(),shared=Buffer.from("ab");
 s.readPart=async()=>shared;
 const iterator=new VerifiedDownloadService(s).streamVerified("t",1,h(shared),2);
 const first=await iterator.next();shared.fill(0);
 assert.equal(first.value?.toString(),"ab");
 await iterator.return(undefined);
});


function pendingRead(){
 let resolve!:(bytes:Buffer<ArrayBuffer>)=>void,reject!:(error:Error)=>void;
 const promise=new Promise<Buffer<ArrayBuffer>>((done,fail)=>{resolve=done;reject=fail;});
 return {promise,resolve,reject};
}

test("abort releases stalled preflight and handles a later storage rejection",async()=>{
 const storage=new MemoryStorage(),pending=pendingRead(),controller=new AbortController();let reads=0;
 storage.readPart=async()=>{reads++;return pending.promise;};
 const iterator=new VerifiedDownloadService(storage).streamVerified("t",2,h(Buffer.from("ab")),2,controller.signal);
 const next=iterator.next();
 controller.abort(new Error("DOWNLOAD_CANCELLED"));
 await assert.rejects(next,/DOWNLOAD_CANCELLED/);
 assert.deepEqual(await iterator.return(undefined),{done:true,value:undefined});
 assert.equal(reads,1);assert.equal(getEventListeners(controller.signal,"abort").length,0);
 pending.reject(new Error("LATE_STORAGE_FAILURE"));
 await new Promise<void>(resolve=>setImmediate(resolve));
});

test("abort releases stalled delivery without emitting its late bytes",async()=>{
 const storage=new MemoryStorage(),pending=pendingRead(),controller=new AbortController();let reads=0;
 storage.readPart=async()=>++reads===4?pending.promise:Buffer.from(reads===2?"b":"a");
 const iterator=new VerifiedDownloadService(storage).streamVerified("t",2,h(Buffer.from("ab")),2,controller.signal);
 assert.equal((await iterator.next()).value?.toString(),"a");
 const next=iterator.next();
 // Let the async generator enter its second delivery read.
 await new Promise<void>(resolve=>setImmediate(resolve));
 controller.abort(new Error("DOWNLOAD_CANCELLED"));
 await assert.rejects(next,/DOWNLOAD_CANCELLED/);
 assert.deepEqual(await iterator.return(undefined),{done:true,value:undefined});
 pending.resolve(Buffer.from("b"));
 await new Promise<void>(resolve=>setImmediate(resolve));
 assert.equal(reads,4);assert.equal(getEventListeners(controller.signal,"abort").length,0);
});

test("already aborted downloads perform no storage reads",async()=>{
 const storage=new MemoryStorage(),controller=new AbortController();let reads=0;
 storage.readPart=async()=>{reads++;return Buffer.from("a");};controller.abort();
 await assert.rejects(new VerifiedDownloadService(storage).streamVerified("t",1,h(Buffer.from("a")),1,controller.signal).next(),{name:"AbortError"});
 assert.equal(reads,0);
});

test("successful and failed reads release cancellation listeners",async()=>{
 const storage=new MemoryStorage(),controller=new AbortController();
 storage.readPart=async()=>Buffer.from("a");
 const emitted:Buffer[]=[];
 for await(const part of new VerifiedDownloadService(storage).streamVerified("t",20,h(Buffer.alloc(20,"a")),20,controller.signal))emitted.push(part);
 assert.equal(emitted.length,20);assert.equal(getEventListeners(controller.signal,"abort").length,0);
 storage.readPart=async()=>{throw new Error("STORAGE_OFFLINE");};
 await assert.rejects(new VerifiedDownloadService(storage).verify("t",1,h(Buffer.from("a")),1,controller.signal),/STORAGE_OFFLINE/);
 assert.equal(getEventListeners(controller.signal,"abort").length,0);
});
