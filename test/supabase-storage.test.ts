import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { SupabaseStorage } from "../src/adapters/supabase-storage.js";

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
