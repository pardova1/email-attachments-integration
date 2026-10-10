import assert from "node:assert/strict";
import test from "node:test";
import { ExactSoftwareConnectionCatalog, type SoftwareConnectionProfile } from "../src/email/exact-software-connection-catalog.js";
import { AutomaticConnectionCoordinator } from "../src/email/automatic-connection-coordinator.js";
import { GlobalConnectionReadinessAgent, REQUIRED_CONNECTION_CHECKS, type ConnectionCheck, type ConnectionEnvironment } from "../src/email/global-connection-readiness-agent.js";
import type { ConnectionProbeTool } from "../src/email/global-connection-validation-runner.js";
const now=new Date("2026-10-10T00:00:00Z");
const environment:ConnectionEnvironment={country:"KW",network:"test-network",provider:"test-provider",client:"test-client",platform:"android",softwareVersion:"1.0"};
function profile():SoftwareConnectionProfile {
 const tools={} as Record<ConnectionCheck,ConnectionProbeTool>;
 for(const check of REQUIRED_CONNECTION_CHECKS)tools[check]={id:check,async run(env){assert.deepEqual(env,environment);return {outcome:"passed",testReference:"synthetic-run",...(check==="recipient-download"?{recipientNeedsInstallation:false}:{})};}};
 return {id:"synthetic-profile",environment:{...environment},reviewedAt:now.toISOString(),expiresAt:new Date(now.getTime()+60_000).toISOString(),sourceReference:"synthetic-discovery",tools};
}
test("coordinator selects exact software probes and never inherits support from country alone",async()=>{
 const catalog=new ExactSoftwareConnectionCatalog([profile()],()=>now),readiness=new GlobalConnectionReadinessAgent();
 for(const patch of [{},{country:"IR"},{network:"other"},{provider:"other"},{client:"other"},{platform:"ios"},{softwareVersion:"2.0"}]){
  const observed={...environment,...patch};
  const coordinator=new AutomaticConnectionCoordinator({async discover(){return {environment:observed,observedAt:now.toISOString(),sourceReference:"synthetic-observation"};}},catalog,readiness,()=>now);
  const result=await coordinator.check();assert.equal(result.status,"assessed");
  if(result.status!=="assessed")throw new Error("EXPECTED_ASSESSMENT");
  assert.equal(result.validation.assessment.status,Object.keys(patch).length?"not-ready":"verified");
 }
});
test("profile expiration and replacement invalidate previously selected probes",async()=>{
 let current=now;const initial=profile(),catalog=new ExactSoftwareConnectionCatalog([initial],()=>current);
 const tools=await catalog.toolsFor(environment,new AbortController().signal);
 current=new Date(initial.expiresAt);
 assert.equal(catalog.lookup(environment).status,"expired");
 assert.deepEqual(await catalog.toolsFor(environment,new AbortController().signal),{});
 await assert.rejects(tools["upload"]!.run(environment,new AbortController().signal),/SOFTWARE_PROFILE_EXPIRED_OR_REPLACED/);
 current=now;catalog.register(profile());
 await assert.rejects(tools["upload"]!.run(environment,new AbortController().signal),/SOFTWARE_PROFILE_EXPIRED_OR_REPLACED/);
});
test("selected tools reject reuse for another country or software version",async()=>{
 const catalog=new ExactSoftwareConnectionCatalog([profile()],()=>now),tools=await catalog.toolsFor(environment,new AbortController().signal);
 for(const patch of [{country:"IR"},{softwareVersion:"2.0"}])await assert.rejects(tools["upload"]!.run({...environment,...patch},new AbortController().signal),/SOFTWARE_PROFILE_ENVIRONMENT_MISMATCH/);
});
test("catalog snapshots registration and preserves adapter receivers",async()=>{
 const input=profile();input.tools.upload={id:"upload",run:async function(){assert.equal(this.id,"upload");return {outcome:"passed",testReference:"receiver"};}};
 const catalog=new ExactSoftwareConnectionCatalog([input],()=>now);
 input.environment.country="IR";input.tools.upload.run=async()=>{throw new Error("MUTATED");};
 const match=catalog.lookup(environment);if(match.status==="matched")match.environment.country="IR";
 const tools=await catalog.toolsFor(environment,new AbortController().signal);
 assert.equal((await tools.upload!.run(environment,new AbortController().signal)).testReference,"receiver");
});
test("profile catalog rejects wildcards stale registration ambiguous ids and unsupported checks",()=>{
 for(const field of ["network","provider","client","platform","softwareVersion"] as const){
  const input=profile();input.environment[field]="*";
  assert.throws(()=>new ExactSoftwareConnectionCatalog([input],()=>now),/EXACT_SOFTWARE_ENVIRONMENT_REQUIRED/);
 }
 const catalog=new ExactSoftwareConnectionCatalog([profile()],()=>now);
 const stale=profile();stale.reviewedAt=new Date(now.getTime()-1).toISOString();
 assert.throws(()=>catalog.register(stale),/STALE_SOFTWARE_PROFILE/);
 const duplicate=profile();duplicate.environment.country="IR";
 assert.throws(()=>catalog.register(duplicate),/DUPLICATE_SOFTWARE_PROFILE_ID/);
 const unsupported=profile();Object.assign(unsupported.tools,{invented:{id:"invented",async run(){return {outcome:"passed",testReference:"synthetic"};}}});
 assert.throws(()=>catalog.register(unsupported),/INVALID_SOFTWARE_PROFILE_TOOL/);
});
test("application installation must pass independently of successful email and downloads",async()=>{
 const input=profile();delete input.tools["application-installation"];
 const coordinator=new AutomaticConnectionCoordinator({async discover(){return {environment,observedAt:now.toISOString(),sourceReference:"synthetic"};}},new ExactSoftwareConnectionCatalog([input],()=>now),new GlobalConnectionReadinessAgent(),()=>now);
 const result=await coordinator.check();if(result.status!=="assessed")throw new Error("EXPECTED_ASSESSMENT");
 assert.equal(result.validation.assessment.status,"not-ready");assert.deepEqual(result.validation.missingTools,["application-installation"]);
});
test("cancelled catalog selection does not return probes",async()=>{
 const catalog=new ExactSoftwareConnectionCatalog([profile()],()=>now),controller=new AbortController();controller.abort();
 await assert.rejects(catalog.toolsFor(environment,controller.signal),{name:"AbortError"});
});
test("a pending probe cannot publish success after its software profile expires",async()=>{
 let current=now,finish!:(value:{outcome:"passed";testReference:string})=>void;
 const input=profile();input.tools.upload={id:"pending",async run(){return new Promise(resolve=>{finish=resolve;});}};
 const catalog=new ExactSoftwareConnectionCatalog([input],()=>current),tools=await catalog.toolsFor(environment,new AbortController().signal);
 const pending=tools.upload!.run(environment,new AbortController().signal);
 current=new Date(input.expiresAt);finish({outcome:"passed",testReference:"late"});
 await assert.rejects(pending,/SOFTWARE_PROFILE_EXPIRED_OR_REPLACED/);
});
test("built-in provider references guide unknown environments without declaring them compatible",async()=>{
 const catalog=new ExactSoftwareConnectionCatalog([],()=>now);
 for(const country of ["NO","SE","IR","KW","NG","KE","ZA"]){
  const actual={...environment,country,provider:"gmail"};
  const result=catalog.lookup(actual);assert.equal(result.status,"unknown");
  if(result.status!=="unknown")throw new Error("EXPECTED_UNKNOWN");
  assert.equal(result.references.countryAvailability,"unverified");
  assert.ok(result.references.entries.some(entry=>entry.id==="gmail-api"));
  assert.equal(result.references.entries.some(entry=>entry.id==="microsoft-graph-mail"),false);
  assert.deepEqual(await catalog.toolsFor(actual,new AbortController().signal),{});
 }
 const inventory=catalog.references.forCountry("IR");inventory.entries[0].name="mutated";
 assert.equal(catalog.references.forCountry("IR").entries[0].name,"Gmail / Google Workspace");
 assert.throws(()=>catalog.references.forCountry("worldwide"),/INVALID_REFERENCE_COUNTRY/);
});
