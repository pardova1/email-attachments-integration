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
