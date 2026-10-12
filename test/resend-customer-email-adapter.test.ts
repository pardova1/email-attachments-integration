import assert from "node:assert/strict";
import test from "node:test";
import {ResendCustomerEmailAdapter} from "../src/adapters/resend-customer-email-adapter.js";
import {MemoryNotificationOutbox} from "../src/adapters/memory-notification-outbox.js";
import {NOTIFICATION_RETRY_WINDOW_MS} from "../src/email/notification-outbox.js";
import {IdempotentEmailDispatcher} from "../src/email/idempotent-email-dispatcher.js";
const message={recipient:"receiver@example.com",subject:"Your transfer — انتقال",text:"Your file is ready. مرحبًا — سلام — Sawubona"};
const accepted=()=>new Response(JSON.stringify({id:"synthetic-receipt"}),{headers:{"content-type":"application/json"}});
const key="re_synthetic_test_key";
const window=()=>{const now=Date.now();return {firstAttemptAt:new Date(now).toISOString(),retryUntil:new Date(now+NOTIFICATION_RETRY_WINDOW_MS).toISOString()};};
test("Resend submits only notification text with protected credentials and a stable opaque event key",async()=>{
 const requests:RequestInit[]=[];const adapter=new ResendCustomerEmailAdapter(key,"bridge@example.com",async(url,init)=>{assert.equal(url,"https://api.resend.com/emails");requests.push(init!);return accepted();});
 await adapter.send(message,{...window(),idempotencyKey:"transfer:private-event:receiver@example.com"});await adapter.send(message,{...window(),idempotencyKey:"transfer:private-event:receiver@example.com"});
 const sent=requests[0];assert.equal(sent.redirect,"error");assert.equal(sent.credentials,"omit");assert.equal(sent.cache,"no-store");assert.equal((sent.headers as Record<string,string>).authorization,`Bearer ${key}`);assert.deepEqual(JSON.parse(sent.body as string),{from:"bridge@example.com",to:[message.recipient],subject:message.subject,text:message.text});
 const header=(sent.headers as Record<string,string>)["Idempotency-Key"];assert.match(header,/^bridge:[a-f0-9]{64}$/);assert.equal(header.includes("receiver"),false);assert.equal(header,(requests[1].headers as Record<string,string>)["Idempotency-Key"]);
});
test("outbox retries after lost acknowledgement reuse the same provider key and original payload",async()=>{
 const keys:string[]=[],bodies:string[]=[];let calls=0;const adapter=new ResendCustomerEmailAdapter(key,"bridge@example.com",async(_url,init)=>{calls++;keys.push((init!.headers as Record<string,string>)["Idempotency-Key"]);bodies.push(init!.body as string);if(calls===1)throw new Error("PRIVATE_LOST_REPLY");return accepted();});
 const outbox=new MemoryNotificationOutbox(),dispatcher=new IdempotentEmailDispatcher(outbox,adapter);
 await assert.rejects(()=>dispatcher.send("event",message),/CUSTOMER_EMAIL_SEND_FAILED/);assert.equal((await outbox.get("event"))?.status,"pending");
 assert.equal((await dispatcher.send("event",{...message,text:"changed outside"})).sent,true);assert.equal((await dispatcher.send("event",message)).deduplicated,true);assert.equal(calls,2);assert.equal(keys[0],keys[1]);assert.equal(bodies[0],bodies[1]);
});
test("rate limits provider errors malformed receipts and oversized bodies never confirm a send",async()=>{
 const responses=[()=>new Response("PRIVATE_DETAIL",{status:429}),()=>new Response("PRIVATE_DETAIL",{status:403}),()=>new Response("PRIVATE_DETAIL",{status:500}),()=>new Response("{}",{headers:{"content-type":"application/json"}}),()=>new Response("not json",{headers:{"content-type":"application/json"}}),()=>new Response("x".repeat(65537),{headers:{"content-type":"application/json"}}),()=>new Response("{}",{headers:{"content-type":"text/html"}})];
 for(const response of responses){const adapter=new ResendCustomerEmailAdapter(key,"bridge@example.com",async()=>response());await assert.rejects(()=>adapter.send(message,{...window(),idempotencyKey:"event"}),{message:"CUSTOMER_EMAIL_SEND_FAILED"});}
});
test("invalid recipients headers and missing event keys cannot start transport",async()=>{
 let calls=0;const adapter=new ResendCustomerEmailAdapter(key,"bridge@example.com",async()=>{calls++;return accepted();});
 for(const invalid of [{...message,recipient:"a@example.com,b@example.com"},{...message,subject:"hello\nBcc: hidden"},{...message,text:""}])await assert.rejects(()=>adapter.send(invalid,{...window(),idempotencyKey:"event"}),/INVALID_CUSTOMER_EMAIL/);
 await assert.rejects(()=>adapter.send(message),/CUSTOMER_EMAIL_IDEMPOTENCY_REQUIRED/);assert.equal(calls,0);
});
test("send timeout aborts a hung transport without leaking late failures",async()=>{
 let signal:AbortSignal|null|undefined,reject!:(reason:unknown)=>void;const adapter=new ResendCustomerEmailAdapter(key,"bridge@example.com",async(_url,init)=>{signal=init?.signal;return new Promise((_resolve,fail)=>{reject=fail;});},10);
 await assert.rejects(()=>adapter.send(message,{...window(),idempotencyKey:"event"}),{message:"CUSTOMER_EMAIL_TIMEOUT"});assert.equal(signal?.aborted,true);reject(new Error("PRIVATE_LATE_FAILURE"));await new Promise(resolve=>setImmediate(resolve));
});
test("external cancellation prevents transport or aborts an in-flight request",async()=>{
 const controller=new AbortController();let calls=0,signal:AbortSignal|null|undefined;const adapter=new ResendCustomerEmailAdapter(key,"bridge@example.com",async(_url,init)=>{calls++;signal=init?.signal;return new Promise(()=>{});});
 const pending=adapter.send(message,{...window(),idempotencyKey:"event",signal:controller.signal});controller.abort(new Error("PRIVATE_CANCEL_DETAIL"));await assert.rejects(()=>pending,{message:"CUSTOMER_EMAIL_SEND_CANCELLED"});assert.equal(signal?.aborted,true);
 await assert.rejects(()=>adapter.send(message,{...window(),idempotencyKey:"event",signal:controller.signal}),/CUSTOMER_EMAIL_SEND_CANCELLED/);assert.equal(calls,1);
});
test("timeout bounds a stalled response body and cancels its reader",async()=>{
 let cancelled=false;const adapter=new ResendCustomerEmailAdapter(key,"bridge@example.com",async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{"content-type":"application/json"}}),10);
 await assert.rejects(()=>adapter.send(message,{...window(),idempotencyKey:"event"}),/CUSTOMER_EMAIL_TIMEOUT/);assert.equal(cancelled,true);
});
test("responses arriving after timeout release their body and cannot confirm acceptance",async()=>{
 let resolve!:(value:Response)=>void,cancelled=false;const adapter=new ResendCustomerEmailAdapter(key,"bridge@example.com",async()=>new Promise(done=>{resolve=done;}),10);
 await assert.rejects(()=>adapter.send(message,{...window(),idempotencyKey:"event"}),/CUSTOMER_EMAIL_TIMEOUT/);
 resolve(new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{"content-type":"application/json"}}));await new Promise(done=>setImmediate(done));assert.equal(cancelled,true);
});
test("expired missing future or oversized retry windows cannot replay an uncertain email",async()=>{
 let calls=0;const adapter=new ResendCustomerEmailAdapter(key,"bridge@example.com",async()=>{calls++;return accepted();}),now=Date.now();
 for(const bounds of [{},{firstAttemptAt:new Date(now-24*3600000).toISOString(),retryUntil:new Date(now-3600000).toISOString()},{firstAttemptAt:new Date(now+3600000).toISOString(),retryUntil:new Date(now+7200000).toISOString()},{firstAttemptAt:new Date(now).toISOString(),retryUntil:new Date(now+24*3600000).toISOString()}])await assert.rejects(()=>adapter.send(message,{idempotencyKey:"old",...bounds}),/CUSTOMER_EMAIL_RECONCILIATION_REQUIRED/);
 assert.equal(calls,0);
});
