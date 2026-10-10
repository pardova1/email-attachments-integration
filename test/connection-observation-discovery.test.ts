import assert from "node:assert/strict";
import test from "node:test";
import { ConnectionObservationDiscovery, type ConnectionObservationSources } from "../src/email/connection-observation-discovery.js";
import { AutomaticConnectionCoordinator } from "../src/email/automatic-connection-coordinator.js";
import { CustomerConnectionFallback } from "../src/email/customer-connection-fallback.js";
import { GlobalConnectionReadinessAgent } from "../src/email/global-connection-readiness-agent.js";
const now=new Date("2026-10-10T18:00:00Z");
function sources():ConnectionObservationSources {
 return {
  async network(){return {details:{country:" kw ",network:"test-network"},observedAt:now.toISOString(),sourceReference:"network-observation"};},
  async provider(){return {details:{provider:"test-provider"},observedAt:now.toISOString(),sourceReference:"authorized-account"};},
  async software(){return {details:{client:"test-browser",platform:"android",softwareVersion:"1.2.3"},observedAt:now.toISOString(),sourceReference:"client-report"};}
 };
}
test("independent automatic observations produce normalized details with per-field sources",async()=>{
 const result=await new ConnectionObservationDiscovery(sources(),()=>now).discover(new AbortController().signal);
 assert.deepEqual(result.environment,{country:"KW",network:"test-network",provider:"test-provider",client:"test-browser",platform:"android",softwareVersion:"1.2.3"});
 assert.equal(result.fieldSources.country,"network-observation");assert.equal(result.fieldSources.provider,"authorized-account");assert.equal(result.fieldSources.softwareVersion,"client-report");
 assert.match(result.sourceReference,/^automatic-discovery:/);
});
test("failed network discovery preserves software and asks only for missing network details",async()=>{
 const configured=sources();configured.network=async()=>{throw new Error("LOOKUP_UNAVAILABLE");};
 const fallback=new CustomerConnectionFallback({country:[{id:"kw",label:"Kuwait",value:"KW"}],network:[{id:"net",label:"Test network",value:"test-network"}]},()=>now);
 const coordinator=new AutomaticConnectionCoordinator(new ConnectionObservationDiscovery(configured,()=>now),{async toolsFor(){return {};}},new GlobalConnectionReadinessAgent(),()=>now,10_000,fallback,"sender-1");
 const result=await coordinator.check();assert.equal(result.status,"customer-input-required");
 if(result.status!=="customer-input-required")throw new Error("EXPECTED_FORM");
 assert.deepEqual(result.form.fields.map(field=>field.key),["country","network"]);
 assert.equal(fallback.resolve("sender-1",result.form.id,{country:"kw",network:"net"}).softwareVersion,"1.2.3");
});
test("slow sources run concurrently and timeout without discarding successful observations",async()=>{
 const configured=sources();let networkSignal:AbortSignal|undefined,softwareStarted=false;
 configured.network=async signal=>{networkSignal=signal;return new Promise(()=>{});};
 const original=configured.software;configured.software=async signal=>{softwareStarted=true;return original(signal);};
 const result=await new ConnectionObservationDiscovery(configured,()=>now,10).discover(new AbortController().signal);
 assert.equal(softwareStarted,true);assert.equal(networkSignal?.aborted,true);
 assert.equal(result.environment.country,undefined);assert.equal(result.environment.softwareVersion,"1.2.3");
});
test("stale future malformed and cross-source fields cannot establish exact software",async()=>{
 const configured=sources();
 configured.network=async()=>({details:{country:"KW",network:"*",provider:"spoofed"},observedAt:new Date(now.getTime()-5*60*1000-1).toISOString(),sourceReference:"stale"});
 configured.provider=async()=>({details:{provider:"test-provider",country:"IR"},observedAt:new Date(now.getTime()+1).toISOString(),sourceReference:"future"});
 configured.software=async()=>({details:{softwareVersion:"1.0",platform:"android",country:"IR"},observedAt:now.toISOString(),sourceReference:"software"});
 const result=await new ConnectionObservationDiscovery(configured,()=>now).discover(new AbortController().signal);
 assert.deepEqual(result.environment,{platform:"android"});
});
test("retained observations cannot mutate while another source is pending",async()=>{
 const configured=sources(),observation=await configured.software(new AbortController().signal);
 let finish!:(value:Awaited<ReturnType<ConnectionObservationSources["network"]>>)=>void;
 configured.software=async()=>observation;configured.network=async()=>new Promise(resolve=>{finish=resolve;});
 const pending=new ConnectionObservationDiscovery(configured,()=>now).discover(new AbortController().signal);
 await new Promise<void>(resolve=>setImmediate(resolve));observation.details.softwareVersion="mutated";
 finish({details:{country:"KW"},observedAt:now.toISOString(),sourceReference:"network"});
 assert.equal((await pending).environment.softwareVersion,"1.2.3");
});
test("external cancellation aborts all sources without returning partial discovery",async()=>{
 const configured=sources();const signals:AbortSignal[]=[];
 for(const group of ["network","provider","software"] as const)configured[group]=async signal=>{signals.push(signal);return new Promise(()=>{});};
 const controller=new AbortController(),pending=new ConnectionObservationDiscovery(configured,()=>now).discover(controller.signal);
 controller.abort();await assert.rejects(pending,{name:"AbortError"});assert.ok(signals.every(signal=>signal.aborted));
 const aborted=new AbortController();aborted.abort();let invoked=false;
 configured.network=async()=>{invoked=true;throw new Error("UNEXPECTED");};
 await assert.rejects(new ConnectionObservationDiscovery(configured,()=>now).discover(aborted.signal),{name:"AbortError"});assert.equal(invoked,false);
});
test("invalid observation values remain unknown instead of becoming customer choices",async()=>{
 const configured=sources();configured.network=async()=>({details:{country:"worldwide",network:"unsafe\nnetwork"},observedAt:now.toISOString(),sourceReference:"network"});
 configured.provider=async()=>({details:{provider:"x".repeat(257)},observedAt:now.toISOString(),sourceReference:"provider"});
 const result=await new ConnectionObservationDiscovery(configured,()=>now).discover(new AbortController().signal);
 assert.equal(result.environment.country,undefined);assert.equal(result.environment.network,undefined);assert.equal(result.environment.provider,undefined);
});
