import assert from "node:assert/strict";
import test from "node:test";
import { CustomerConnectionFallback, renderConnectionFallback } from "../src/email/customer-connection-fallback.js";
import { AutomaticConnectionCoordinator } from "../src/email/automatic-connection-coordinator.js";
import { GlobalConnectionReadinessAgent, REQUIRED_CONNECTION_CHECKS, type ConnectionCheck, type ConnectionEnvironment } from "../src/email/global-connection-readiness-agent.js";
import type { ConnectionProbeTool } from "../src/email/global-connection-validation-runner.js";
const now=new Date("2026-10-10T00:00:00Z");
const known={network:"test-network",provider:"test-provider",client:"test-client",platform:"android",softwareVersion:"1.0"};
const choices={country:[{id:"norway",label:"Norway",value:"NO"},{id:"sweden",label:"Sweden",value:"SE"}]};
const observation={environment:known,observedAt:now.toISOString(),sourceReference:"automatic:1"};
function toolset(){
 const tools={} as Record<ConnectionCheck,ConnectionProbeTool>;
 for(const check of REQUIRED_CONNECTION_CHECKS)tools[check]={id:check,async run(){return {outcome:"passed",testReference:"run",...(check==="recipient-download"?{recipientNeedsInstallation:false}:{})};}};
 return tools;
}

test("incomplete discovery offers only missing dropdowns and retains detected details",async()=>{
 const fallback=new CustomerConnectionFallback(choices,()=>now);let selected:ConnectionEnvironment|undefined;
 const coordinator=new AutomaticConnectionCoordinator({async discover(){return observation;}},{async toolsFor(env){selected=env;return toolset();}},new GlobalConnectionReadinessAgent(),()=>now,10_000,fallback);
 const result=await coordinator.check();assert.equal(result.status,"customer-input-required");
 if(result.status!=="customer-input-required")throw new Error("FORM_REQUIRED");
 assert.deepEqual(result.form.fields.map(field=>field.key),["country"]);
 const checked=await coordinator.submitFallback(result.form.id,{country:"norway"});
 assert.equal(checked.status,"assessed");assert.equal(checked.retryRequired,false);
 if(checked.status==="assessed")assert.equal(checked.environmentSource,"customer-selection");
 assert.deepEqual(selected,{...known,country:"NO"});
});

test("successful automatic discovery never prompts the customer",async()=>{
 const fallback=new CustomerConnectionFallback(choices,()=>now);
 const coordinator=new AutomaticConnectionCoordinator({async discover(){return {...observation,environment:{...known,country:"NO"}};}},{async toolsFor(){return toolset();}},new GlobalConnectionReadinessAgent(),()=>now,10_000,fallback);
 assert.equal((await coordinator.check()).status,"assessed");
});

test("customer selection cannot skip failed connection checks",async()=>{
 const fallback=new CustomerConnectionFallback(choices,()=>now);
 const coordinator=new AutomaticConnectionCoordinator({async discover(){return observation;}},{async toolsFor(){return {};}},new GlobalConnectionReadinessAgent(),()=>now,10_000,fallback);
 const result=await coordinator.check();if(result.status!=="customer-input-required")throw new Error("FORM_REQUIRED");
 const checked=await coordinator.submitFallback(result.form.id,{country:"sweden"});
 assert.equal(checked.status,"assessed");assert.equal(checked.retryRequired,true);
});

test("catalog failure after successful discovery is an internal retry without customer dropdowns",async()=>{
 const coordinator=new AutomaticConnectionCoordinator({async discover(){return {...observation,environment:{...known,country:"NO"}};}},{async toolsFor(){throw new Error("CATALOG_OFFLINE");}},new GlobalConnectionReadinessAgent(),()=>now,10_000,new CustomerConnectionFallback(choices,()=>now));
 assert.equal((await coordinator.check()).status,"pending-internal-retry");
});

test("fallback rejects invented choices extra fields and caller form mutation",()=>{
 const fallback=new CustomerConnectionFallback(choices,()=>now),form=fallback.prepare(known,["country"])!;
 assert.throws(()=>fallback.resolve(form.id,{country:"invented"}),/INVALID_CONNECTION_SELECTION/);
 assert.throws(()=>fallback.resolve(form.id,{country:"norway",platform:"ios"}),/INVALID_CONNECTION_SELECTION/);
 form.fields[0].options[0].value="IR";
 assert.equal(fallback.resolve(form.id,{country:"norway"}).country,"NO");
});

test("expired forms and unavailable catalogs cannot supply untested customer values",()=>{
 let current=now;
 const fallback=new CustomerConnectionFallback(choices,()=>current),form=fallback.prepare(known,["country"])!;
 current=new Date(form.expiresAt);
 assert.throws(()=>fallback.resolve(form.id,{country:"norway"}),/CONNECTION_FORM_EXPIRED/);
 assert.equal(fallback.prepare({},["platform"]),undefined);
});

test("dropdown renderer uses accessible required selects and escapes catalog labels",()=>{
 const fallback=new CustomerConnectionFallback({country:[{id:"no",label:'Norway <script>alert("x")</script>',value:"NO"}]},()=>now);
 const form=fallback.prepare(known,["country"])!,html=renderConnectionFallback(form,"/connection-assistance");
 assert.match(html,/<label for="country">Country<\/label>/);
 assert.match(html,/<select id="country" name="country" required>/);
 assert.match(html,/Choose an option/);assert.match(html,/Check connection/);
 assert.equal(html.includes("<script>"),false);assert.match(html,/&lt;script&gt;/);
 for(const path of ["https://external.example","//external.example","/\\external.example"]){
  assert.throws(()=>renderConnectionFallback(form,path),/INVALID_CONNECTION_FORM_ACTION/);
 }
});


test("complete detection failure can offer every required dropdown from its catalog",async()=>{
 const completeChoices={...choices,...Object.fromEntries(Object.entries(known).map(([key,value])=>[key,[{id:value,label:value,value}]]))};
 const fallback=new CustomerConnectionFallback(completeChoices,()=>now);
 const coordinator=new AutomaticConnectionCoordinator({async discover(){throw new Error("DISCOVERY_UNAVAILABLE");}},{async toolsFor(){return toolset();}},new GlobalConnectionReadinessAgent(),()=>now,10_000,fallback);
 const result=await coordinator.check();assert.equal(result.status,"customer-input-required");
 if(result.status==="customer-input-required")assert.deepEqual(result.form.fields.map(field=>field.key),["country","network","provider","client","platform","softwareVersion"]);
});
