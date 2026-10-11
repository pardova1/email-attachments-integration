import assert from "node:assert/strict";
import test from "node:test";
import {AutomaticConnectionCoordinator,type AutomaticConnectionDiscovery} from "../src/email/automatic-connection-coordinator.js";
import {CustomerConnectionFallback} from "../src/email/customer-connection-fallback.js";
import {GlobalConnectionReadinessAgent} from "../src/email/global-connection-readiness-agent.js";
const now=new Date("2026-10-11T00:00:00Z"),known={country:"NO",network:"old-network",client:"browser",platform:"android",softwareVersion:"1.0"};
function setup(){
 let current:AutomaticConnectionDiscovery={environment:known,observedAt:now.toISOString(),sourceReference:"synthetic-original"};let fail=false;
 const selected:unknown[]=[];
 const fallback=new CustomerConnectionFallback({provider:[{id:"mail",label:"Mail",value:"mail",requires:{country:"NO"}}],network:[{id:"new",label:"New network",value:"new-network"}]},()=>now);
 const coordinator=new AutomaticConnectionCoordinator({async discover(){if(fail)throw new Error("PRIVATE_LOOKUP_ERROR");return structuredClone(current);}},{async toolsFor(env){selected.push(env);return {};}},new GlobalConnectionReadinessAgent(),()=>now,10_000,fallback,"sender-a");
 return {coordinator,selected,set(environment:AutomaticConnectionDiscovery["environment"]){current={environment,observedAt:now.toISOString(),sourceReference:"synthetic-current"};},fail(){fail=true;}};
}
async function form(coordinator:AutomaticConnectionCoordinator){const result=await coordinator.check();if(result.status!=="customer-input-required")throw new Error("FORM_REQUIRED");return result.form;}
test("network changes discard old form context and regenerate only current missing fields",async()=>{
 const item=setup(),first=await form(item.coordinator);item.set({...known,network:"new-network"});
 const renewed=await item.coordinator.submitFallback(first.id,{provider:"mail"});assert.equal(item.selected.length,0);if(renewed.status!=="customer-input-required")throw new Error("NEW_FORM_REQUIRED");assert.notEqual(renewed.form.id,first.id);assert.deepEqual(renewed.form.fields.map(field=>field.key),["provider"]);
 await item.coordinator.submitFallback(renewed.form.id,{provider:"mail"});assert.deepEqual(item.selected,[{...known,network:"new-network",provider:"mail"}]);
});
test("lost automatic observations cannot be reused as current details",async()=>{
 const item=setup(),first=await form(item.coordinator);const {network:_network,...remaining}=known;item.set(remaining);
 const renewed=await item.coordinator.submitFallback(first.id,{provider:"mail"});assert.equal(item.selected.length,0);if(renewed.status!=="customer-input-required")throw new Error("NEW_FORM_REQUIRED");assert.deepEqual(renewed.form.fields.map(field=>field.key),["network","provider"]);
});
test("newly complete discovery overrides obsolete customer choices through normal validation",async()=>{
 const item=setup(),first=await form(item.coordinator);item.set({...known,country:"SE",network:"new-network",provider:"other-mail",softwareVersion:"2.0"});
 const result=await item.coordinator.submitFallback(first.id,{provider:"mail"});assert.equal(result.status,"assessed");if(result.status!=="assessed")throw new Error("ASSESSMENT_REQUIRED");assert.equal(result.environmentSource,"automatic");assert.equal(result.retryRequired,true);assert.deepEqual(item.selected,[{...known,country:"SE",network:"new-network",provider:"other-mail",softwareVersion:"2.0"}]);
});
test("refresh failure stays an internal retry and cannot validate stale form context",async()=>{
 const item=setup(),first=await form(item.coordinator);item.fail();const result=await item.coordinator.submitFallback(first.id,{provider:"mail"});assert.equal(result.status,"pending-internal-retry");assert.equal(item.selected.length,0);assert.equal(JSON.stringify(result).includes("PRIVATE_LOOKUP_ERROR"),false);
});
test("country changes cannot reuse choices filtered against the old country",async()=>{
 const item=setup(),first=await form(item.coordinator);item.set({...known,country:"SE"});const result=await item.coordinator.submitFallback(first.id,{provider:"mail"});assert.equal(result.status,"pending-internal-retry");assert.equal(item.selected.length,0);
});

test("source failures during selection refresh remain internal even if every field is present",async()=>{
 const firstObservation={environment:known,observedAt:now.toISOString(),sourceReference:"synthetic-original"};let retry=false,calls=0;
 const fallback=new CustomerConnectionFallback({provider:[{id:"mail",label:"Mail",value:"mail"}]},()=>now);
 const coordinator=new AutomaticConnectionCoordinator({async discover(){return {...firstObservation,...(retry?{retryFields:["network" as const]}:{})};}},{async toolsFor(){calls++;return {};}},new GlobalConnectionReadinessAgent(),()=>now,10_000,fallback,"sender-a");
 const first=await form(coordinator);retry=true;assert.equal((await coordinator.submitFallback(first.id,{provider:"mail"})).status,"pending-internal-retry");assert.equal(calls,0);
});
test("malformed refreshed manual or automatic details cannot reuse a form or run probes",async()=>{
 for(const patch of [{provider:123},{provider:"*"},{country:"Norway"},{network:null},{softwareVersion:"bad\nversion"}]){
  const item=setup(),first=await form(item.coordinator);item.set({...known,...patch} as unknown as AutomaticConnectionDiscovery["environment"]);
  const result=await item.coordinator.submitFallback(first.id,{provider:"mail"});assert.equal(result.status,"pending-internal-retry");assert.equal(item.selected.length,0);assert.equal("form" in result,false);
  item.set(known);assert.equal((await item.coordinator.submitFallback(first.id,{provider:"mail"})).status,"assessed");assert.equal(item.selected.length,1);
 }
});
test("customer selections retain the refreshed automatic observation deadline",async()=>{
 const {REQUIRED_CONNECTION_CHECKS}=await import("../src/email/global-connection-readiness-agent.js");const fallback=new CustomerConnectionFallback({provider:[{id:"mail",label:"Mail",value:"mail"}]},()=>now);
 const coordinator=new AutomaticConnectionCoordinator({async discover(){return {environment:known,observedAt:new Date(now.getTime()-299_000).toISOString(),sourceReference:"synthetic-old-observation"};}},{async toolsFor(){return Object.fromEntries(REQUIRED_CONNECTION_CHECKS.map(check=>[check,{id:check,async run(){return {outcome:"passed" as const,testReference:"synthetic",...(check==="recipient-download"?{recipientNeedsInstallation:false}:{})};}}]));}},new GlobalConnectionReadinessAgent(),()=>now,10_000,fallback,"sender-a");
 const first=await form(coordinator),result=await coordinator.submitFallback(first.id,{provider:"mail"});if(result.status!=="assessed")throw new Error("EXPECTED_ASSESSMENT");assert.equal(result.validation.assessment.status,"verified");assert.equal(result.validation.assessment.expiresAt,new Date(now.getTime()+1000).toISOString());
});
