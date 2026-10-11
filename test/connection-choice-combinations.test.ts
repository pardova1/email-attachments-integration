import assert from "node:assert/strict";
import test from "node:test";
import {CustomerConnectionFallback} from "../src/email/customer-connection-fallback.js";
import {AutomaticConnectionCoordinator} from "../src/email/automatic-connection-coordinator.js";
import {GlobalConnectionReadinessAgent} from "../src/email/global-connection-readiness-agent.js";
const now=new Date("2026-10-11T00:00:00Z"),known={country:"NO",provider:"mail",platform:"android"};
const choices={
 network:[{id:"net-a",label:"A",value:"a"},{id:"net-b",label:"B",value:"b"}],
 client:[{id:"app-a",label:"App A",value:"app-a",requires:{network:"a"}},{id:"app-b",label:"App B",value:"app-b",requires:{network:"b"}}],
 softwareVersion:[{id:"impossible",label:"Impossible",value:"1",requires:{network:"b",client:"app-a"}},{id:"valid",label:"Valid",value:"2",requires:{network:"b",client:"app-b"}}]
};
test("choices must occur in a complete compatible combination rather than match prerequisites individually",()=>{
 const fallback=new CustomerConnectionFallback(choices,()=>now),form=fallback.prepare("sender-a",known,["network","client","softwareVersion"])!;
 assert.deepEqual(form.fields.map(field=>field.options.map(option=>option.id)),[["net-b"],["app-b"],["valid"]]);
 assert.deepEqual(fallback.resolve("sender-a",form.id,{network:"net-b",client:"app-b",softwareVersion:"valid"}),{...known,network:"b",client:"app-b",softwareVersion:"2"});
 assert.throws(()=>fallback.resolve("sender-a",form.id,{network:"net-a",client:"app-a",softwareVersion:"impossible"}),/INVALID_CONNECTION_SELECTION/);
});
test("catalogs with no complete combination stay on internal retry without a dead-end form",async()=>{
 const fallback=new CustomerConnectionFallback({...choices,softwareVersion:[choices.softwareVersion[0]]},()=>now);assert.equal(fallback.prepare("sender-a",known,["network","client","softwareVersion"]),undefined);
 let probes=0;const coordinator=new AutomaticConnectionCoordinator({async discover(){return {environment:known,observedAt:now.toISOString(),sourceReference:"synthetic"};}},{async toolsFor(){probes++;return {};}},new GlobalConnectionReadinessAgent(),()=>now,10_000,fallback,"sender-a");assert.equal((await coordinator.check()).status,"pending-internal-retry");assert.equal(probes,0);
});
test("multiple valid branches remain offered while each software version keeps its app dependency",()=>{
 const fallback=new CustomerConnectionFallback({...choices,softwareVersion:[{id:"a1",label:"A1",value:"1",requires:{client:"app-a"}},{id:"b2",label:"B2",value:"2",requires:{client:"app-b"}}]},()=>now);
 const form=fallback.prepare("sender-a",known,["network","client","softwareVersion"])!;assert.deepEqual(form.fields.map(field=>field.options.length),[2,2,2]);
 for(const suffix of ["a","b"]){const selections={network:`net-${suffix}`,client:`app-${suffix}`,softwareVersion:suffix==="a"?"a1":"b2"};assert.equal(fallback.resolve("sender-a",form.id,selections).client,`app-${suffix}`);}
 assert.throws(()=>fallback.resolve("sender-a",form.id,{network:"net-a",client:"app-a",softwareVersion:"b2"}),/INCOMPATIBLE_CONNECTION_SELECTION/);
});
test("large independent choice sets do not require enumerating all combinations",()=>{
 const values=Array.from({length:250},(_value,index)=>({id:`choice-${index}`,label:`Choice ${index}`,value:`value-${index}`}));
 const fallback=new CustomerConnectionFallback({network:values,provider:values,client:values,softwareVersion:values},()=>now),form=fallback.prepare("sender-a",{country:"NO",platform:"android"},["network","provider","client","softwareVersion"]);
 assert.deepEqual(form?.fields.map(field=>field.options.length),[250,250,250,250]);
});
test("complex catalogs exceeding the work budget cannot publish an unchecked form",()=>{
 const values=Array.from({length:250},(_value,index)=>({id:`choice-${index}`,label:`Choice ${index}`,value:`value-${index}`}));
 const fallback=new CustomerConnectionFallback({network:values,provider:values,client:[{id:"app",label:"App",value:"app",requires:{network:"value-0",provider:"value-0"}}]},()=>now);
 assert.equal(fallback.prepare("sender-a",{country:"NO",platform:"android",softwareVersion:"1"},["network","provider","client"]),undefined);
});
