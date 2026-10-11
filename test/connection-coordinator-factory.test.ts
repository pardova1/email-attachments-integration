import assert from "node:assert/strict";
import test from "node:test";
import {createConnectionCoordinatorFactory} from "../src/config/connection-coordinator-factory.js";
import {CustomerConnectionFallback} from "../src/email/customer-connection-fallback.js";
import type {ConnectionRequestContext} from "../src/http/connection-check-router.js";
const now=new Date("2026-10-10T12:00:00Z"),known={network:"test",provider:"test",client:"browser",platform:"android",softwareVersion:"1"};
const context=(reference:string):ConnectionRequestContext=>({requestReference:reference,networkAddress:"192.0.2.1",softwareHints:{client:"browser"}});
function fallback(){return new CustomerConnectionFallback({country:[{id:"no",label:"Norway",value:"NO"}]},()=>now);}
test("fresh coordinators retain customer-bound forms across requests",async()=>{
 const factory=createConnectionCoordinatorFactory({fallback:fallback(),catalog:{async toolsFor(){return {};}},clock:()=>now,async discoveryFor(){return {async discover(){return {environment:known,observedAt:now.toISOString(),sourceReference:"test"};}};}});
 const first=await factory({userId:"sender-a"},context("first"),new AbortController().signal),result=await first.check();
 if(result.status!=="customer-input-required")throw new Error("EXPECTED_FORM");
 const second=await factory({userId:"sender-a"},context("second"),new AbortController().signal);assert.notEqual(first,second);
 const checked=await second.submitFallback(result.form.id,{country:"no"});assert.equal(checked.status,"assessed");assert.equal(checked.retryRequired,true);
 const other=await factory({userId:"sender-b"},context("third"),new AbortController().signal);
 await assert.rejects(other.submitFallback(result.form.id,{country:"no"}),/CONNECTION_FORM_UNAVAILABLE/);
});
test("discovery receives isolated current request context without retaining caller mutations",async()=>{
 const seen:string[]=[];const factory=createConnectionCoordinatorFactory({fallback:fallback(),catalog:{async toolsFor(){return {};}},clock:()=>now,async discoveryFor(customer,input){
  const reference=input.requestReference;seen.push(reference);customer.userId="mutated";input.softwareHints!.client="mutated";
  return {async discover(){return {environment:{...known,country:reference==="first"?"NO":"SE"},observedAt:now.toISOString(),sourceReference:reference};}};
 }});
 const customer={userId:"sender-a"},input=context("first"),signal=new AbortController().signal;
 const first=await factory(customer,input,signal),second=await factory(customer,context("second"),signal);
 assert.equal(customer.userId,"sender-a");assert.equal(input.softwareHints?.client,"browser");first.assertCustomerScope("sender-a");
 const results=await Promise.all([first.check(),second.check()]);assert.deepEqual(seen,["first","second"]);
 for(const [index,result] of results.entries()){if(result.status!=="assessed")throw new Error("EXPECTED_ASSESSMENT");assert.equal(result.validation.assessment.environment.country,index===0?"NO":"SE");}
});
test("cancelled factory setup never returns a coordinator",async()=>{
 const controller=new AbortController();let called=0;
 const factory=createConnectionCoordinatorFactory({fallback:fallback(),catalog:{async toolsFor(){return {};}},async discoveryFor(){called++;controller.abort();return {async discover(){throw new Error("unused");}};}});
 await assert.rejects(factory({userId:"sender"},context("test"),controller.signal),{name:"AbortError"});assert.equal(called,1);
 await assert.rejects(factory({userId:"sender"},context("test"),controller.signal),{name:"AbortError"});assert.equal(called,1);
});
test("invalid configuration scope and discovery are rejected before use",async()=>{
 const options={fallback:fallback(),catalog:{async toolsFor(){return {};}},async discoveryFor(){return undefined as never;}};
 assert.throws(()=>createConnectionCoordinatorFactory({...options,internalTimeoutMs:0}),/INVALID_AUTOMATIC_CONNECTION_POLICY/);
 const factory=createConnectionCoordinatorFactory(options),signal=new AbortController().signal;
 await assert.rejects(factory({userId:""},context("test"),signal),/CONNECTION_CUSTOMER_SCOPE_REQUIRED/);
 await assert.rejects(factory({userId:"sender"},context("test"),signal),/CONNECTION_DISCOVERY_NOT_CONFIGURED/);
});
test("overlapping requests for the same environment keep independent evidence and completion order",async()=>{
 const {REQUIRED_CONNECTION_CHECKS}=await import("../src/email/global-connection-readiness-agent.js");
 for(const sameCustomer of [false,true])for(const firstPassed of [false,true]){
  let current=now,selections=0,entered!:()=>void,release!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  const factory=createConnectionCoordinatorFactory({fallback:fallback(),clock:()=>current,async discoveryFor(){return {async discover(){return {environment:{...known,country:"NO"},observedAt:current.toISOString(),sourceReference:"synthetic-observation"};}};},catalog:{async toolsFor(){
   const first=++selections===1,passed=first?firstPassed:!firstPassed;
   return Object.fromEntries(REQUIRED_CONNECTION_CHECKS.map(check=>[check,{id:check,async run(){if(first&&check==="application-installation"){entered();await gate;}return {outcome:passed?"passed" as const:"failed" as const,testReference:first?"first-request":"second-request",...(check==="recipient-download"?{recipientNeedsInstallation:false}:{})};}}]));
  }}});
  const signal=new AbortController().signal,first=await factory({userId:"sender-a"},context("first"),signal),second=await factory({userId:sameCustomer?"sender-a":"sender-b"},context("second"),signal);
  const running=first.check();await started;current=new Date(now.getTime()+1);const later=await second.check();release();const earlier=await running;
  assert.equal(earlier.status,"assessed");assert.equal(later.status,"assessed");if(earlier.status!=="assessed"||later.status!=="assessed")throw new Error("INDEPENDENT_ASSESSMENTS_REQUIRED");
  assert.equal(earlier.validation.assessment.status,firstPassed?"verified":"not-ready");assert.equal(later.validation.assessment.status,firstPassed?"not-ready":"verified");assert.equal(earlier.validation.assessment.checkedAt,now.toISOString());assert.equal(later.validation.assessment.checkedAt,current.toISOString());
 }
});
test("request catalog selection gets isolated authenticated scope and context",async()=>{
 const seen:{scope:string;reference:string}[]=[];let selected=0;
 const factory=createConnectionCoordinatorFactory({fallback:fallback(),clock:()=>now,catalog:{async toolsFor(){throw new Error("GLOBAL_CATALOG_MUST_NOT_RUN");}},async discoveryFor(){return {async discover(){return {environment:{...known,country:"NO"},observedAt:now.toISOString(),sourceReference:"test"};}};},async catalogFor(customer,input,signal){signal.throwIfAborted();const scope=customer.userId;seen.push({scope,reference:input.requestReference});customer.userId="mutated";input.softwareHints!.client="mutated";return {async toolsFor(){assert.equal(scope,"sender-a");selected++;return {};}};}});
 const customer={userId:"sender-a"},input=context("first"),coordinator=await factory(customer,input,new AbortController().signal);const result=await coordinator.check();assert.equal(result.status,"assessed");assert.equal(selected,1);assert.deepEqual(seen,[{scope:"sender-a",reference:"first"}]);assert.equal(customer.userId,"sender-a");assert.equal(input.softwareHints!.client,"browser");coordinator.assertCustomerScope("sender-a");
});
test("invalid or cancelled request catalogs never fall back to global tools",async()=>{
 const controller=new AbortController(),options={fallback:fallback(),catalog:{async toolsFor(){throw new Error("MUST_NOT_RUN");}},async discoveryFor(){return {async discover(){throw new Error("MUST_NOT_RUN");}};}};
 assert.throws(()=>createConnectionCoordinatorFactory({...options,catalogFor:123 as never}),/INVALID_CONNECTION_CATALOG_FACTORY/);
 const invalid=createConnectionCoordinatorFactory({...options,async catalogFor(){return {} as never;}});await assert.rejects(invalid({userId:"sender-a"},context("first"),controller.signal),/CONNECTION_CATALOG_NOT_CONFIGURED/);
 const cancelled=createConnectionCoordinatorFactory({...options,async catalogFor(){controller.abort();return options.catalog;}});await assert.rejects(cancelled({userId:"sender-a"},context("first"),controller.signal),{name:"AbortError"});
});
test("discovery setup cannot change the request snapshot later used for customer tools",async()=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let reference:string|undefined,client:string|undefined;
 const factory=createConnectionCoordinatorFactory({fallback:fallback(),catalog:{async toolsFor(){return {};}},async discoveryFor(){await gate;return {async discover(){throw new Error("UNUSED");}};},async catalogFor(_customer,input){reference=input.requestReference;client=input.softwareHints?.client;return {async toolsFor(){return {};}};}});
 const input=context("original"),customer={userId:"sender-a"},pending=factory(customer,input,new AbortController().signal);input.requestReference="changed";input.softwareHints!.client="changed";customer.userId="sender-b";release();const coordinator=await pending;coordinator.assertCustomerScope("sender-a");assert.equal(reference,"original");assert.equal(client,"browser");
});
test("hanging discovery and customer catalog setup share a bounded cancellation deadline",async()=>{
 for(const stage of ["discovery","catalog"]){
  let adapterSignal:AbortSignal|undefined,catalogCalls=0;
  const factory=createConnectionCoordinatorFactory({fallback:fallback(),catalog:{async toolsFor(){throw new Error("MUST_NOT_RUN");}},internalTimeoutMs:10,async discoveryFor(_customer,_context,signal){if(stage==="discovery"){adapterSignal=signal;return new Promise(()=>{});}return {async discover(){throw new Error("MUST_NOT_RUN");}};},async catalogFor(_customer,_context,signal){catalogCalls++;adapterSignal=signal;return new Promise(()=>{});}});
  await assert.rejects(factory({userId:"sender-a"},context(stage),new AbortController().signal),/CONNECTION_COORDINATOR_SETUP_TIMEOUT/);assert.equal(adapterSignal?.aborted,true);assert.equal(catalogCalls,stage==="catalog"?1:0);
 }
});
test("caller cancellation releases setup even when discovery ignores its signal",async()=>{
 const controller=new AbortController();let finish!:(value:{discover:()=>Promise<never>})=>void,catalogCalls=0,adapterSignal:AbortSignal|undefined;
 const factory=createConnectionCoordinatorFactory({fallback:fallback(),catalog:{async toolsFor(){return {};}},async discoveryFor(_customer,_context,signal){adapterSignal=signal;return new Promise(resolve=>{finish=resolve;});},async catalogFor(){catalogCalls++;return {async toolsFor(){return {};}};}});
 const running=factory({userId:"sender-a"},context("cancelled"),controller.signal);controller.abort();await assert.rejects(running,{name:"AbortError"});assert.equal(adapterSignal?.aborted,true);finish({async discover(){throw new Error("MUST_NOT_RUN");}});await new Promise(resolve=>setImmediate(resolve));assert.equal(catalogCalls,0);
});
test("late customer catalog rejection after timeout cannot publish a coordinator",async()=>{
 let fail!:(error:Error)=>void,adapterSignal:AbortSignal|undefined;
 const factory=createConnectionCoordinatorFactory({fallback:fallback(),internalTimeoutMs:10,catalog:{async toolsFor(){return {};}},async discoveryFor(){return {async discover(){throw new Error("MUST_NOT_RUN");}};},async catalogFor(_customer,_context,signal){adapterSignal=signal;return new Promise((_resolve,reject)=>{fail=reject;});}});
 await assert.rejects(factory({userId:"sender-a"},context("late"),new AbortController().signal),/CONNECTION_COORDINATOR_SETUP_TIMEOUT/);assert.equal(adapterSignal?.aborted,true);fail(new Error("LATE_PRIVATE_ADAPTER_FAILURE"));await new Promise(resolve=>setImmediate(resolve));
});
