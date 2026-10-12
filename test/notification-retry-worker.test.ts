import assert from "node:assert/strict";
import test from "node:test";
import {MemoryNotificationOutbox} from "../src/adapters/memory-notification-outbox.js";
import {IdempotentEmailDispatcher} from "../src/email/idempotent-email-dispatcher.js";
import {NotificationRetryWorker} from "../src/email/notification-retry-worker.js";
const message={recipient:"receiver@example.com",subject:"s",text:"original"};
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
test("a new worker recovers a saved expired claim with its original message and provider event key",async()=>{
 let now=new Date("2026-10-12T17:00:00Z");const outbox=new MemoryNotificationOutbox(()=>now);await outbox.reserve("event",message);const interrupted=await outbox.claim("event");assert.ok(interrupted);now=new Date(now.getTime()+120000);const delivered:unknown[]=[],contexts:unknown[]=[];
 const worker=new NotificationRetryWorker(outbox,new IdempotentEmailDispatcher(outbox,{async send(value,context){delivered.push(value);contexts.push(context);}}));const result=await worker.runOnce(now);
 assert.equal(result.sent,1);assert.deepEqual(delivered,[message]);assert.equal((contexts[0] as {idempotencyKey:string}).idempotencyKey,"event");assert.equal((contexts[0] as {firstAttemptAt:string}).firstAttemptAt,interrupted.firstAttemptAt);assert.equal((await outbox.get("event"))?.status,"sent");
});
test("paging advances past failed messages and wraps to retry them without starving later events",async()=>{
 const outbox=new MemoryNotificationOutbox();for(const key of ["a","b","c"])await outbox.reserve(key,{...message,text:key});const calls:string[]=[];let failing=true;const worker=new NotificationRetryWorker(outbox,new IdempotentEmailDispatcher(outbox,{async send(value){calls.push(value.text);if(value.text==="a"&&failing)throw new Error("PRIVATE_PROVIDER_FAILURE");}}),2);
 const first=await worker.runOnce();assert.equal(first.failed,1);assert.equal(first.sent,1);assert.equal((await worker.runOnce()).sent,1);assert.equal((await worker.runOnce()).scanned,0);failing=false;assert.equal((await worker.runOnce()).sent,1);assert.deepEqual(calls,["a","b","c","a"]);
});
test("active claims and reconciled events are excluded while expired retry windows become internal reconciliation",async()=>{
 let now=new Date("2026-10-12T17:00:00Z"),calls=0;const outbox=new MemoryNotificationOutbox(()=>now);await outbox.reserve("active",message);const active=await outbox.claim("active");assert.ok(active);
 const worker=new NotificationRetryWorker(outbox,new IdempotentEmailDispatcher(outbox,{async send(){calls++;}}));assert.equal((await worker.runOnce(now)).scanned,0);now=new Date(active.retryUntil);const expired=await worker.runOnce(now);assert.equal(expired.reconciliationRequired,1);assert.equal(calls,0);assert.equal((await outbox.get("active"))?.status,"reconciliation-required");assert.equal((await worker.runOnce(now)).scanned,0);
});
test("overlapping runs are skipped and batch timeout prevents late source results from sending",async()=>{
 const outbox=new MemoryNotificationOutbox();await outbox.reserve("event",message);let finish!:(keys:string[])=>void,calls=0;outbox.listRetryCandidates=async()=>new Promise(resolve=>{finish=resolve;});
 const worker=new NotificationRetryWorker(outbox,{async retry(){calls++;return {sent:true,deduplicated:false};}},1,10);const pending=worker.runOnce();assert.equal((await worker.runOnce()).skipped,true);await assert.rejects(()=>pending,/NOTIFICATION_BATCH_TIMEOUT/);finish(["event"]);await flush();assert.equal(calls,0);
});
test("scheduler starts immediately waits between batches and stops outstanding sends on shutdown",async t=>{
 t.mock.timers.enable({apis:["setTimeout"]});const outbox=new MemoryNotificationOutbox();await outbox.reserve("event",message);let signal:AbortSignal|undefined,calls=0,reports=0;
 const worker=new NotificationRetryWorker(outbox,new IdempotentEmailDispatcher(outbox,{async send(_message,context){calls++;signal=context?.signal;return new Promise((_resolve,reject)=>signal!.addEventListener("abort",()=>reject(new Error("stopped")),{once:true}));}}));
 const stop=worker.start(1000,()=>{reports++;});await flush();assert.equal(calls,1);assert.throws(()=>worker.start(),/ALREADY_STARTED/);t.mock.timers.tick(1000);await flush();assert.equal(calls,1);stop();await flush();assert.equal(signal?.aborted,true);assert.equal((await outbox.get("event"))?.status,"pending");t.mock.timers.tick(120000);await flush();assert.equal(calls,1);assert.equal(reports,0);
});
test("scheduler retries source failures later even when its reporting callback throws",async t=>{
 t.mock.timers.enable({apis:["setTimeout"]});const outbox=new MemoryNotificationOutbox();let scans=0;outbox.listRetryCandidates=async()=>{scans++;if(scans===1)throw new Error("PRIVATE_DATABASE_FAILURE");return [];};const worker=new NotificationRetryWorker(outbox,{async retry(){throw new Error("UNEXPECTED");}});const stop=worker.start(1000,()=>{throw new Error("report failed");});
 try{await flush();assert.equal(scans,1);t.mock.timers.tick(1000);await flush();assert.equal(scans,2);}finally{stop();}
});
test("invalid worker settings and malformed candidate batches cannot invoke a send",async()=>{
 const outbox=new MemoryNotificationOutbox();let calls=0;const dispatcher={async retry(){calls++;return {sent:true,deduplicated:false};}};for(const size of [0,101,1.5])assert.throws(()=>new NotificationRetryWorker(outbox,dispatcher,size),/INVALID_NOTIFICATION_BATCH/);assert.throws(()=>new NotificationRetryWorker(outbox,dispatcher,1,0),/INVALID_NOTIFICATION_WORKER_TIMEOUT/);
 for(const keys of [["duplicate","duplicate"],[""],["a","b","c"]]){outbox.listRetryCandidates=async()=>keys;await assert.rejects(()=>new NotificationRetryWorker(outbox,dispatcher,2).runOnce(),/INVALID_NOTIFICATION_BATCH_RESPONSE/);}assert.equal(calls,0);
});
test("separate workers can share a queue without submitting the same saved event twice",async()=>{
 const outbox=new MemoryNotificationOutbox();for(const key of ["a","b"])await outbox.reserve(key,{...message,text:key});let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;}),sent:string[]=[];
 const dispatcher=new IdempotentEmailDispatcher(outbox,{async send(value){sent.push(value.text);await held;}}),first=new NotificationRetryWorker(outbox,dispatcher),second=new NotificationRetryWorker(outbox,dispatcher);
 const pending=Promise.all([first.runOnce(),second.runOnce()]);await flush();assert.deepEqual([...sent].sort(),["a","b"]);release();const results=await pending;assert.equal(results.reduce((total,result)=>total+result.sent,0),2);assert.equal(sent.length,2);
});
