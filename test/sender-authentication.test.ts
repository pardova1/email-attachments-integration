import assert from "node:assert/strict";
import test from "node:test";
import {getEventListeners} from "node:events";
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

test("already cancelled authentication performs no network request",async()=>{
 let calls=0;const controller=new AbortController();controller.abort();
 const a=new SupabaseSenderAuthenticator("https://example.supabase.co","publishable",async()=>{calls++;throw new Error("UNEXPECTED");});
 await assert.rejects(a.authenticate("Bearer valid-token",controller.signal),{name:"AbortError"});assert.equal(calls,0);
});
test("cancellation releases an uncooperative authentication lookup and passes its signal",async()=>{
 let received:AbortSignal|null|undefined,finish!:(response:Response)=>void;const controller=new AbortController();let cancelled=0;
 const a=new SupabaseSenderAuthenticator("https://example.supabase.co","publishable",async(_url,init)=>{received=init?.signal;return new Promise<Response>(resolve=>{finish=resolve;});});
 const pending=a.authenticate("Bearer valid-token",controller.signal);assert.equal(received,controller.signal);controller.abort();await assert.rejects(pending,{name:"AbortError"});
 finish(new Response(new ReadableStream({cancel(){cancelled++;}})));await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(cancelled,1);
});
test("cancellation during body parsing never publishes a late identity and removes its listener",async()=>{
 let finish!:(value:unknown)=>void,entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});const controller=new AbortController();
 const response={ok:true,body:null,async json(){entered();return new Promise(resolve=>{finish=resolve;});}} as unknown as Response;
 const a=new SupabaseSenderAuthenticator("https://example.supabase.co","publishable",async()=>response);
 const pending=a.authenticate("Bearer valid-token",controller.signal);await started;controller.abort();await assert.rejects(pending,{name:"AbortError"});assert.equal(getEventListeners(controller.signal,"abort").length,0);
 finish({id:"late-identity"});await new Promise<void>(resolve=>setImmediate(resolve));
});
test("successful authentication and rejected responses release resources",async()=>{
 const controller=new AbortController();
 const a=new SupabaseSenderAuthenticator("https://example.supabase.co","publishable",async()=>new Response(JSON.stringify({id:"sender-a"})));
 assert.deepEqual(await a.authenticate("Bearer valid-token",controller.signal),{userId:"sender-a",email:undefined});assert.equal(getEventListeners(controller.signal,"abort").length,0);
 let released=false;const rejected=new SupabaseSenderAuthenticator("https://example.supabase.co","publishable",async()=>new Response(new ReadableStream({cancel(){released=true;}}),{status:401}));await assert.rejects(rejected.authenticate("Bearer invalid",controller.signal),/SENDER_AUTHENTICATION_REQUIRED/);assert.equal(released,true);assert.equal(getEventListeners(controller.signal,"abort").length,0);
});
