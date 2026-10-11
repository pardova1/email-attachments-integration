import assert from "node:assert/strict";
import test from "node:test";
import { AutomaticConnectionCoordinator, type AutomaticConnectionDiscovery, type ConnectionDiscoveryPort, type ConnectionToolCatalog } from "../src/email/automatic-connection-coordinator.js";
import { GlobalConnectionReadinessAgent, REQUIRED_CONNECTION_CHECKS, type ConnectionCheck, type ConnectionEnvironment } from "../src/email/global-connection-readiness-agent.js";
import type { ConnectionProbeTool } from "../src/email/global-connection-validation-runner.js";
const now=new Date("2026-10-10T00:00:00Z");
function observation(country="KW",version="1.0"): AutomaticConnectionDiscovery & { environment: ConnectionEnvironment } {
 return {environment:{country,network:"observed-network",provider:"observed-provider",client:"observed-client",platform:"android",softwareVersion:version},observedAt:now.toISOString(),sourceReference:"internal-observation:1"};
}
function tools(){
 const result={} as Record<ConnectionCheck,ConnectionProbeTool>;
 for(const check of REQUIRED_CONNECTION_CHECKS)result[check]={id:check,async run(){return {outcome:"passed",testReference:"run",...(check==="recipient-download"?{recipientNeedsInstallation:false}:{})};}};
 return result;
}

test("automatic check discovers the environment and selects tools without caller choices",async()=>{
 let discovered=false,selected=false;
 const coordinator=new AutomaticConnectionCoordinator({async discover(){discovered=true;return observation();}}, {async toolsFor(environment){selected=true;assert.equal(environment.country,"KW");assert.equal(environment.softwareVersion,"1.0");return tools();}},new GlobalConnectionReadinessAgent(),()=>now);
 const result=await coordinator.check();
 assert.equal(discovered,true);assert.equal(selected,true);assert.equal(result.status,"assessed");assert.equal(result.retryRequired,false);
 if(result.status==="assessed")assert.equal(result.validation.assessment.status,"verified");
});

test("software or country changes are rediscovered and revalidated automatically",async()=>{
 const observations=[observation("NO","1.0"),observation("SE","2.0")];const selected:string[]=[];
 const coordinator=new AutomaticConnectionCoordinator({async discover(){return observations.shift()!;}},{async toolsFor(environment){selected.push(`${environment.country}:${environment.softwareVersion}`);return tools();}},new GlobalConnectionReadinessAgent(),()=>now);
 assert.equal((await coordinator.check()).retryRequired,false);assert.equal((await coordinator.check()).retryRequired,false);
 assert.deepEqual(selected,["NO:1.0","SE:2.0"]);
});

test("discovery failure remains an internal retry without exposing private errors",async()=>{
 let selections=0;
 const coordinator=new AutomaticConnectionCoordinator({async discover(){throw new Error("PRIVATE_LOOKUP_FAILURE");}},{async toolsFor(){selections++;return tools();}},new GlobalConnectionReadinessAgent(),()=>now);
 const result=await coordinator.check();assert.equal(result.status,"pending-internal-retry");assert.equal(result.retryRequired,true);assert.equal(selections,0);
 assert.equal(JSON.stringify(result).includes("PRIVATE_LOOKUP_FAILURE"),false);
});

test("missing stale or future discovery evidence cannot select connection tools",async()=>{
 for(const kind of ["missing-source","stale","future","unknown-software"]){
  const input=observation();let selections=0;
  if(kind==="missing-source")input.sourceReference="";
  if(kind==="stale")input.observedAt=new Date(now.getTime()-6*60*1000).toISOString();
  if(kind==="future")input.observedAt=new Date(now.getTime()+1).toISOString();
  if(kind==="unknown-software")input.environment.softwareVersion="";
  const coordinator=new AutomaticConnectionCoordinator({async discover(){return input;}},{async toolsFor(){selections++;return tools();}},new GlobalConnectionReadinessAgent(),()=>now);
  assert.equal((await coordinator.check()).status,"pending-internal-retry");assert.equal(selections,0);
 }
});

test("automatic checks keep missing tools internal instead of declaring readiness",async()=>{
 const coordinator=new AutomaticConnectionCoordinator({async discover(){return observation();}},{async toolsFor(){return {};}},new GlobalConnectionReadinessAgent(),()=>now);
 const result=await coordinator.check();assert.equal(result.status,"assessed");assert.equal(result.retryRequired,true);
 if(result.status==="assessed")assert.deepEqual(result.validation.missingTools,[...REQUIRED_CONNECTION_CHECKS]);
});

test("unresponsive discovery times out and signals its tool",async()=>{
 let discoverySignal:AbortSignal|undefined;
 const coordinator=new AutomaticConnectionCoordinator({async discover(signal){discoverySignal=signal;return new Promise(()=>{});}},{async toolsFor(){return tools();}},new GlobalConnectionReadinessAgent(),()=>now,10);
 assert.equal((await coordinator.check()).status,"pending-internal-retry");assert.equal(discoverySignal?.aborted,true);
});

test("cancellation stops automatic discovery without publishing evidence",async()=>{
 const controller=new AbortController(),readiness=new GlobalConnectionReadinessAgent();let entered!:()=>void;
 const started=new Promise<void>(resolve=>{entered=resolve;});
 const discovery:ConnectionDiscoveryPort={async discover(){entered();return new Promise(()=>{});}};
 const catalog:ConnectionToolCatalog={async toolsFor(){throw new Error("MUST_NOT_SELECT");}};
 const running=new AutomaticConnectionCoordinator(discovery,catalog,readiness,()=>now).check(controller.signal);
 await started;controller.abort();await assert.rejects(running,{name:"AbortError"});
 assert.equal(readiness.assess(observation().environment,now).status,"unverified");
});
test("malformed discovery details stay internal even when dropdown choices are configured",async()=>{
 const {CustomerConnectionFallback,CONNECTION_FIELDS}=await import("../src/email/customer-connection-fallback.js");
 const fallback=new CustomerConnectionFallback(Object.fromEntries(CONNECTION_FIELDS.map(field=>[field,[{id:field,label:field,value:observation().environment[field]}]])),()=>now);
 for(const field of CONNECTION_FIELDS){
  for(const value of [null,123,"*","bad\nvalue","x".repeat(257),...(field==="country"?["Norway"]:[])]){
   const input=observation();Object.assign(input.environment,{[field]:value});let calls=0;
   const coordinator=new AutomaticConnectionCoordinator({async discover(){return input;}},{async toolsFor(){calls++;return tools();}},new GlobalConnectionReadinessAgent(),()=>now,10_000,fallback,"sender-a");
   const result=await coordinator.check();assert.equal(result.status,"pending-internal-retry");assert.equal(calls,0);assert.equal("form" in result,false);
  }
 }
});
test("valid absent and blank discovery details still offer only the missing dropdown",async()=>{
 const {CustomerConnectionFallback}=await import("../src/email/customer-connection-fallback.js");
 const fallback=new CustomerConnectionFallback({provider:[{id:"mail",label:"Mail",value:"observed-provider",requires:{country:"KW"}}]},()=>now);
 for(const provider of [undefined,"","   "]){
  const input=observation();Object.assign(input.environment,{provider,country:" kw ",client:" observed-client "});
  const coordinator=new AutomaticConnectionCoordinator({async discover(){return input;}},{async toolsFor(){throw new Error("MUST_NOT_PROBE");}},new GlobalConnectionReadinessAgent(),()=>now,10_000,fallback,"sender-a");
  const result=await coordinator.check();if(result.status!=="customer-input-required")throw new Error("EXPECTED_MISSING_PROVIDER_FORM");assert.deepEqual(result.form.fields.map(field=>field.key),["provider"]);assert.equal(result.form.fields[0].options.length,1);
 }
});
test("malformed discovery envelopes cannot generate forms or select adapters",async()=>{
 const {CustomerConnectionFallback}=await import("../src/email/customer-connection-fallback.js");
 const fallback=new CustomerConnectionFallback({country:[{id:"kw",label:"Kuwait",value:"KW"}]},()=>now);
 for(const input of [null,{...observation(),environment:[]},{...observation(),environment:null},{...observation(),sourceReference:123},{...observation(),observedAt:123},{...observation(),retryFields:["invented"]}]){
  let calls=0;const coordinator=new AutomaticConnectionCoordinator({async discover(){return input as unknown as AutomaticConnectionDiscovery;}},{async toolsFor(){calls++;return tools();}},new GlobalConnectionReadinessAgent(),()=>now,10_000,fallback,"sender-a");
  assert.equal((await coordinator.check()).status,"pending-internal-retry");assert.equal(calls,0);
 }
});
test("verified readiness cannot outlive the discovery freshness deadline",async()=>{
 const input=observation();input.observedAt=new Date(now.getTime()-299_000).toISOString();let current=now;
 const agent=new GlobalConnectionReadinessAgent(),coordinator=new AutomaticConnectionCoordinator({async discover(){return input;}},{async toolsFor(){current=new Date(now.getTime()+500);return tools();}},agent,()=>current);
 const result=await coordinator.check();if(result.status!=="assessed")throw new Error("EXPECTED_ASSESSMENT");assert.equal(result.validation.assessment.status,"verified");assert.equal(result.validation.assessment.expiresAt,new Date(now.getTime()+1000).toISOString());
 current=new Date(now.getTime()+1000);assert.equal(agent.assess(input.environment,current).status,"unverified");
});
test("observations expiring during tool selection cannot start probes",async()=>{
 const input=observation();input.observedAt=new Date(now.getTime()-299_000).toISOString();let current=now,calls=0;const configured=tools();for(const tool of Object.values(configured))tool.run=async()=>{calls++;return {outcome:"passed",testReference:"must-not-run"};};
 const coordinator=new AutomaticConnectionCoordinator({async discover(){return input;}},{async toolsFor(){current=new Date(now.getTime()+1000);return configured;}},new GlobalConnectionReadinessAgent(),()=>current);
 assert.equal((await coordinator.check()).status,"pending-internal-retry");assert.equal(calls,0);
});
