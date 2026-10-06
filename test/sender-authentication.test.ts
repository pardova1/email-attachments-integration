import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseSenderAuthenticator } from "../src/security/supabase-sender-authenticator.js";

test("verified Supabase user becomes sender identity",async()=>{
 const old=globalThis.fetch; globalThis.fetch=async(_i:any,init?:any)=>{assert.equal(init.headers.Authorization,"Bearer valid-token");return new Response(JSON.stringify({id:"auth-user-1",email:"sender@example.com"}),{status:200,headers:{"Content-Type":"application/json"}});};
 try{const a=new SupabaseSenderAuthenticator("https://example.supabase.co","publishable");assert.deepEqual(await a.authenticate("Bearer valid-token"),{userId:"auth-user-1",email:"sender@example.com"});}finally{globalThis.fetch=old;}
});
test("missing bearer token is rejected",async()=>{const a=new SupabaseSenderAuthenticator("https://example.supabase.co","publishable");await assert.rejects(()=>a.authenticate(undefined),/SENDER_AUTHENTICATION_REQUIRED/);});
test("invalid bearer token is rejected",async()=>{
 const old=globalThis.fetch; globalThis.fetch=async()=>new Response("{}",{status:401});
 try{const a=new SupabaseSenderAuthenticator("https://example.supabase.co","publishable");await assert.rejects(()=>a.authenticate("Bearer invalid"),/SENDER_AUTHENTICATION_REQUIRED/);}finally{globalThis.fetch=old;}
});
