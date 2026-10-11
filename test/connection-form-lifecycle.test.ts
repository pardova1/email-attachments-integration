import assert from "node:assert/strict";
import test from "node:test";
import {observeConnectionFormLifecycle} from "../src/client/connection-form-lifecycle.js";
import {ConnectionFormModel} from "../src/client/connection-form-model.js";
import type {ConnectionClientResult} from "../src/client/connection-check-client.js";
class Page extends EventTarget {visibilityState:DocumentVisibilityState="visible";}
function verified():ConnectionClientResult{return {status:"assessed",retryRequired:false,language:"en",discoveryReference:"test-only",environmentSource:"automatic",validation:{missingTools:[],assessment:{environment:{country:"NO",network:"test",provider:"test",client:"test",platform:"test",softwareVersion:"1"},status:"verified",requiredChecks:[],reasons:[],checkedAt:"2026-10-10T12:00:00Z",expiresAt:"2026-10-10T12:01:00Z"}}};}
for(const event of ["visibilitychange","pageshow","focus"]){
 test(`${event} withdraws expired readiness after suspension without a network call`,async()=>{
  let now=new Date("2026-10-10T12:00:00Z"),requests=0;
  const page=new Page(),window=new EventTarget(),model=new ConnectionFormModel({async check(){requests++;return verified();},async submit(){return verified();}},"fa",()=>now);
  await model.check();let latest=model.state();model.subscribe(state=>{latest=state;});
  const stop=observeConnectionFormLifecycle(page,window,()=>model.refresh());
  page.visibilityState="hidden";now=new Date("2026-10-10T12:02:00Z");page.dispatchEvent(new Event("visibilitychange"));
  assert.equal(latest.result?.retryRequired,false);
  page.visibilityState="visible";(event==="visibilitychange"?page:window).dispatchEvent(new Event(event));
  assert.equal(latest.result?.retryRequired,true);assert.equal(requests,1);assert.equal(latest.language,"fa");
  stop();model.dispose();
 });
}
test("resume observers remove every listener and tolerate repeated disposal",()=>{
 const page=new Page(),window=new EventTarget();let refreshes=0;
 const stop=observeConnectionFormLifecycle(page,window,()=>{refreshes++;});
 page.dispatchEvent(new Event("visibilitychange"));window.dispatchEvent(new Event("pageshow"));window.dispatchEvent(new Event("focus"));assert.equal(refreshes,3);
 stop();stop();page.dispatchEvent(new Event("visibilitychange"));window.dispatchEvent(new Event("pageshow"));window.dispatchEvent(new Event("focus"));assert.equal(refreshes,3);
});
test("a document without a window still reconciles visibility changes",()=>{
 const page=new Page();let refreshes=0;const stop=observeConnectionFormLifecycle(page,null,()=>{refreshes++;});
 page.visibilityState="hidden";page.dispatchEvent(new Event("visibilitychange"));assert.equal(refreshes,0);
 page.visibilityState="visible";page.dispatchEvent(new Event("visibilitychange"));assert.equal(refreshes,1);stop();
});


test("offline and online events withdraw readiness even while the page is hidden",async()=>{
 const page=new Page(),window=new EventTarget();let requests=0;
 const model=new ConnectionFormModel({async check(){requests++;return verified();},async submit(){return verified();}},"ar",()=>new Date("2026-10-10T12:00:30Z"));await model.check();
 const stop=observeConnectionFormLifecycle(page,window,()=>model.refresh(),()=>model.invalidateConnection());page.visibilityState="hidden";window.dispatchEvent(new Event("offline"));
 const result=model.state().result;if(result?.status!=="assessed")throw new Error("EXPECTED_ASSESSMENT");assert.equal(result.validation.assessment.status,"unverified");assert.deepEqual(result.validation.assessment.reasons,["CONNECTION_CHANGED"]);
 window.dispatchEvent(new Event("online"));assert.equal(model.state().result?.retryRequired,true);assert.equal(requests,1);assert.equal(model.state().language,"ar");
 await model.check();assert.equal(model.state().result?.retryRequired,false);assert.equal(requests,2);
 stop();window.dispatchEvent(new Event("offline"));assert.equal(model.state().result?.retryRequired,false);model.dispose();
});
test("connection changes abort pending checks and ignore late verified replies",async()=>{
 let finish!:(result:ConnectionClientResult)=>void,signal:AbortSignal|undefined;
 const model=new ConnectionFormModel({async check(_input,current){signal=current;return new Promise(resolve=>{finish=resolve;});},async submit(){return verified();}},"en",()=>new Date("2026-10-10T12:00:30Z"));
 const pending=model.check();model.invalidateConnection();assert.equal(signal?.aborted,true);finish(verified());await pending;
 assert.equal(model.state().phase,"unavailable");assert.equal(model.state().result,undefined);
});
test("connection changes discard fallback choices tied to the previous network",async()=>{
 const result:ConnectionClientResult={status:"customer-input-required",retryRequired:true,language:"en",direction:"ltr",languageOptions:[{tag:"en",label:"English"}],form:{id:"11111111-1111-4111-8111-111111111111",message:"Choose",expiresAt:"2026-10-10T12:01:00Z",fields:[{key:"country",label:"Country",options:[{id:"no",label:"Norway",value:"NO"}]}]}};
 let submissions=0;const model=new ConnectionFormModel({async check(){return result;},async submit(){submissions++;return verified();}},"fa",()=>new Date("2026-10-10T12:00:30Z"));await model.check();model.choose("country","no");assert.equal(model.state().canSubmit,true);
 model.invalidateConnection();assert.deepEqual(model.state().selections,{});assert.equal(model.state().result,undefined);await assert.rejects(model.submit(),/CONNECTION_FORM_NOT_READY/);assert.equal(submissions,0);
});
test("online event bursts invalidate immediately and coalesce automatic recovery",async()=>{
 const page=new Page(),window=new EventTarget();let invalidations=0,recoveries=0;
 const stop=observeConnectionFormLifecycle(page,window,()=>{},()=>{invalidations++;},()=>{recoveries++;},5);
 try{window.dispatchEvent(new Event("online"));window.dispatchEvent(new Event("online"));window.dispatchEvent(new Event("focus"));assert.equal(invalidations,2);assert.equal(recoveries,0);await new Promise(resolve=>setTimeout(resolve,15));assert.equal(recoveries,1);window.dispatchEvent(new Event("focus"));await new Promise(resolve=>setTimeout(resolve,15));assert.equal(recoveries,1);}finally{stop();}
});
test("hidden online recovery waits for visibility and still performs only one check",async()=>{
 const page=new Page(),window=new EventTarget();let recoveries=0;page.visibilityState="hidden";
 const stop=observeConnectionFormLifecycle(page,window,()=>{},()=>{},()=>{recoveries++;},5);
 try{window.dispatchEvent(new Event("online"));await new Promise(resolve=>setTimeout(resolve,15));assert.equal(recoveries,0);page.visibilityState="visible";page.dispatchEvent(new Event("visibilitychange"));window.dispatchEvent(new Event("pageshow"));await new Promise(resolve=>setTimeout(resolve,15));assert.equal(recoveries,1);}finally{stop();}
});
test("offline and disposal cancel scheduled recovery",async()=>{
 for(const action of ["offline","dispose"]){
  const page=new Page(),window=new EventTarget();let recoveries=0;const stop=observeConnectionFormLifecycle(page,window,()=>{},()=>{},()=>{recoveries++;},5);
  window.dispatchEvent(new Event("online"));if(action==="offline")window.dispatchEvent(new Event("offline"));else stop();await new Promise(resolve=>setTimeout(resolve,15));assert.equal(recoveries,0);stop();
 }
});
test("recovery delay is bounded before registering listeners",()=>{
 for(const delay of [-1,1001,1.5])assert.throws(()=>observeConnectionFormLifecycle(new Page(),new EventTarget(),()=>{},()=>{},()=>{},delay),/INVALID_CONNECTION_RECOVERY_DELAY/);
});
test("network invalidation reports the observed offline or online state",()=>{
 const page=new Page(),window=new EventTarget(),states:(boolean|undefined)[]=[];const stop=observeConnectionFormLifecycle(page,window,()=>{},online=>states.push(online));
 try{window.dispatchEvent(new Event("offline"));window.dispatchEvent(new Event("online"));assert.deepEqual(states,[false,true]);}finally{stop();}
});
