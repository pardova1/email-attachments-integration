import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { SupabaseStorage } from "../src/adapters/supabase-storage.js";

test("purge deletes exact chunk paths in batches without skipping remaining objects",async()=>{
 const original=globalThis.fetch;
 const objects=Array.from({length:205},(_,i)=>String(i+1));
 const removed:string[]=[];
 globalThis.fetch=async(input,init={})=>{
  const body=JSON.parse(String(init.body));
  if(init.method==="POST"){
   assert.match(String(input),/\/object\/list\/transfer-bytes$/);
   assert.equal(body.prefix,"t1/parts");assert.equal(body.offset,0);
   return new Response(JSON.stringify(objects.slice(0,body.limit).map(name=>({name}))),{status:200});
  }
  assert.equal(init.method,"DELETE");
  for(const path of body.prefixes){assert.match(path,/^t1\/parts\/\d+$/);removed.push(path);}
  objects.splice(0,body.prefixes.length);
  return new Response("[]",{status:200});
 };
 try{
  await new SupabaseStorage("https://example.supabase.co","secret").purge("t1");
  assert.equal(removed.length,205);assert.equal(objects.length,0);
 }finally{globalThis.fetch=original;}
});

test("storage list failure blocks successful cleanup",async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response("",{status:503});
 try{await assert.rejects(new SupabaseStorage("https://example.supabase.co","secret").purge("t1"),/TRANSFER_STORAGE_PURGE_FAILED/);}
 finally{globalThis.fetch=original;}
});

test("durable storage hashes exact stored bytes in part order", async () => {
  const original=globalThis.fetch;
  const stored=new Map<string,Buffer>();
  globalThis.fetch=async (input,init={}) => {
    const url=String(input);
    if(init.method==="POST") { stored.set(url,Buffer.from(init.body as Buffer)); return new Response("{}",{status:200}); }
    const data=stored.get(url); return data ? new Response(new Uint8Array(data),{status:200}) : new Response("",{status:404});
  };
  try {
    const storage=new SupabaseStorage("https://example.supabase.co","secret");
    await storage.putPart("t1",1,Buffer.from("hello "));
    await storage.putPart("t1",2,Buffer.from("world"));
    const result=await storage.complete("t1",2);
    assert.equal(result.sha256,createHash("sha256").update("hello world").digest("hex"));
    assert.equal(result.totalBytes,11);
    assert.deepEqual(await storage.readPart("t1",2),Buffer.from("world"));
  } finally { globalThis.fetch=original; }
});

test("missing durable part prevents completion", async () => {
  const original=globalThis.fetch;
  globalThis.fetch=async () => new Response("",{status:404});
  try {
    const storage=new SupabaseStorage("https://example.supabase.co","secret");
    await assert.rejects(storage.complete("missing",1),/TRANSFER_STORAGE_READ_FAILED/);
  } finally { globalThis.fetch=original; }
});
