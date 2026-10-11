import assert from "node:assert/strict";
import test from "node:test";
import {getEventListeners} from "node:events";
import {ConnectionObservationDiscovery,type ConnectionObservationSources} from "../src/email/connection-observation-discovery.js";
const now=new Date("2026-10-11T00:00:00Z");
const observation=(details:object)=>({details,observedAt:now.toISOString(),sourceReference:"synthetic"});
function sources():ConnectionObservationSources{return {async network(){return observation({country:"NO",network:"network"});},async provider(){return observation({provider:"mail"});},async software(){return observation({client:"browser",platform:"android",softwareVersion:"1"});}};}
test("temporary failures recover within one discovery without repeating successful sources",async()=>{
 const configured=sources();let networks=0,providers=0,software=0;
 configured.network=async()=>{networks++;if(networks===1)throw new Error("TEMPORARY");return observation({country:"NO",network:"network"});};configured.provider=async()=>{providers++;return observation({provider:"mail"});};configured.software=async()=>{software++;return observation({client:"browser",platform:"android",softwareVersion:"1"});};
 const result=await new ConnectionObservationDiscovery(configured,()=>now,100,{delayMs:0}).discover(new AbortController().signal);assert.equal(result.environment.country,"NO");assert.deepEqual(result.retryFields,[]);assert.deepEqual([networks,providers,software],[2,1,1]);
});
test("valid unknown details and malformed successful responses are not retried",async()=>{
 const configured=sources();let calls=0;configured.network=async()=>{calls++;return observation({});};const discovery=new ConnectionObservationDiscovery(configured,()=>now,100,{delayMs:0});
 assert.deepEqual((await discovery.discover(new AbortController().signal)).retryFields,[]);assert.equal(calls,1);
 configured.provider=async()=>({details:{provider:"unsafe\nvalue"},observedAt:now.toISOString(),sourceReference:"synthetic"});const result=await new ConnectionObservationDiscovery(configured,()=>now,100,{delayMs:0}).discover(new AbortController().signal);assert.deepEqual(result.retryFields,["provider"]);assert.equal(calls,2);
});
test("exhausted retries stay bounded and preserve independent details",async()=>{
 for(const maxAttempts of [1,3]){const configured=sources();let calls=0;configured.network=async()=>{calls++;throw new Error("PRIVATE_ERROR");};const result=await new ConnectionObservationDiscovery(configured,()=>now,100,{maxAttempts,delayMs:0}).discover(new AbortController().signal);assert.equal(calls,maxAttempts);assert.deepEqual(result.retryFields,["country","network"]);assert.equal(result.environment.provider,"mail");assert.equal(JSON.stringify(result).includes("PRIVATE_ERROR"),false);}
});
test("timed-out attempts use fresh signals and late results cannot replace recovered observations",async()=>{
 const configured=sources(),signals:AbortSignal[]=[];let finish!:(value:Awaited<ReturnType<ConnectionObservationSources["network"]>>)=>void;
 configured.network=async signal=>{signals.push(signal);if(signals.length===1)return new Promise(resolve=>{finish=resolve;});return observation({country:"NO",network:"network"});};
 const result=await new ConnectionObservationDiscovery(configured,()=>now,10,{delayMs:0}).discover(new AbortController().signal);assert.equal(signals.length,2);assert.equal(signals[0].aborted,true);assert.notEqual(signals[0],signals[1]);assert.equal(result.environment.country,"NO");assert.deepEqual(result.retryFields,[]);
 finish(observation({country:"IR",network:"late-network"}));await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(result.environment.country,"NO");
});
test("cancellation during retry delay prevents another attempt and releases listeners",async()=>{
 const configured=sources();let calls=0;configured.network=async()=>{calls++;throw new Error("TEMPORARY");};const controller=new AbortController();
 const pending=new ConnectionObservationDiscovery(configured,()=>now,100,{delayMs:1000}).discover(controller.signal);await new Promise<void>(resolve=>setImmediate(resolve));controller.abort();await assert.rejects(pending,{name:"AbortError"});assert.equal(calls,1);assert.equal(getEventListeners(controller.signal,"abort").length,0);
});
test("retry policies reject unbounded settings and snapshot caller configuration",async()=>{
 for(const policy of [{maxAttempts:0},{maxAttempts:4},{maxAttempts:1.5},{delayMs:-1},{delayMs:1001},{delayMs:NaN}])assert.throws(()=>new ConnectionObservationDiscovery(sources(),()=>now,100,policy),/INVALID_DISCOVERY_RETRY_POLICY/);
 const configured=sources(),policy={maxAttempts:1,delayMs:0};let calls=0;configured.network=async()=>{calls++;throw new Error("TEMPORARY");};const discovery=new ConnectionObservationDiscovery(configured,()=>now,100,policy);policy.maxAttempts=3;await discovery.discover(new AbortController().signal);assert.equal(calls,1);
});
