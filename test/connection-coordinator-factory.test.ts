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
