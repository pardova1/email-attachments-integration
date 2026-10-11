import assert from "node:assert/strict";
import test from "node:test";
import {createObservedConnectionCoordinatorFactory} from "../src/config/observed-connection-coordinator-factory.js";
import {CustomerConnectionFallback} from "../src/email/customer-connection-fallback.js";
import type {ConnectionRequestContext} from "../src/http/connection-check-router.js";
const now=new Date("2026-10-10T12:00:00Z"),context:ConnectionRequestContext={requestReference:"synthetic-request",networkAddress:"192.0.2.1",softwareHints:{client:"Google Chrome",platform:"android",softwareVersion:"155.0.8000.1"}};
const observation=(details:object,sourceReference:string)=>({details,sourceReference,observedAt:now.toISOString()});
test("observed factory keeps network provider and software fields separate and still requires probes",async()=>{
 let environment:unknown;const input=structuredClone(context);Object.assign(input.softwareHints!,{country:"KW",provider:"spoofed"});
 const factory=createObservedConnectionCoordinatorFactory({clock:()=>now,fallback:new CustomerConnectionFallback({}),catalog:{async toolsFor(value){environment=value;return {};}},async network(customer,request){assert.equal(customer.userId,"sender-a");assert.equal(request.networkAddress,"192.0.2.1");request.softwareHints!.client="mutated";return observation({country:"IR",network:"test-network",client:"spoofed-network-client"},"network:test");},async provider(customer){assert.equal(customer.userId,"sender-a");return observation({provider:"gmail",country:"SE"},"account:test");}});
 const coordinator=await factory({userId:"sender-a"},input,new AbortController().signal),result=await coordinator.check();assert.equal(result.status,"assessed");assert.equal(result.retryRequired,true);
 assert.deepEqual(environment,{country:"IR",network:"test-network",provider:"gmail",client:"Google Chrome",platform:"android",softwareVersion:"155.0.8000.1"});assert.equal(input.softwareHints?.client,"Google Chrome");
});
test("missing provider metadata asks only for provider and retains automatically observed software",async()=>{
 const fallback=new CustomerConnectionFallback({provider:[{id:"gmail",label:"Gmail",value:"gmail"}]},()=>now);let selected:unknown;
 const factory=createObservedConnectionCoordinatorFactory({clock:()=>now,fallback,catalog:{async toolsFor(environment){selected=environment;return {};}},async network(){return observation({country:"NO",network:"test-network"},"network:test");},async provider(){return observation({},"account:unknown");}});
 const first=await factory({userId:"sender-a"},context,new AbortController().signal),result=await first.check();if(result.status!=="customer-input-required")throw new Error("EXPECTED_FORM");assert.deepEqual(result.form.fields.map(field=>field.key),["provider"]);
 const second=await factory({userId:"sender-a"},context,new AbortController().signal);const checked=await second.submitFallback(result.form.id,{provider:"gmail"});assert.equal(checked.retryRequired,true);assert.deepEqual(selected,{country:"NO",network:"test-network",provider:"gmail",...context.softwareHints});
});
test("hanging network observation stays internal instead of requesting network dropdowns",async()=>{
 const fallback=new CustomerConnectionFallback({country:[{id:"no",label:"Norway",value:"NO"}],network:[{id:"network",label:"Network",value:"network"}]},()=>now);
 const factory=createObservedConnectionCoordinatorFactory({clock:()=>now,sourceTimeoutMs:10,fallback,catalog:{async toolsFor(){return {};}},async network(){return new Promise(()=>{});},async provider(){return observation({provider:"gmail"},"account:test");}});
 const coordinator=await factory({userId:"sender-a"},context,new AbortController().signal);const result=await coordinator.check();assert.equal(result.status,"pending-internal-retry");
});
test("invalid source policies fail at setup",()=>{
 const options={fallback:new CustomerConnectionFallback({}),catalog:{async toolsFor(){return {};}},async network(){return observation({},"test");},async provider(){return observation({},"test");}};
 assert.throws(()=>createObservedConnectionCoordinatorFactory({...options,sourceTimeoutMs:0}),/INVALID_DISCOVERY_SOURCES/);
 assert.throws(()=>createObservedConnectionCoordinatorFactory({...options,provider:undefined as never}),/INVALID_DISCOVERY_SOURCES/);
});
