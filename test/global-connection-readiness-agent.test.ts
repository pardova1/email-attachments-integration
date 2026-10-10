import assert from "node:assert/strict";
import test from "node:test";
import { GlobalConnectionReadinessAgent, REQUIRED_CONNECTION_CHECKS, type ConnectionEnvironment, type ConnectionEvidence } from "../src/email/global-connection-readiness-agent.js";
const now = new Date("2026-10-10T00:00:00Z");
const environment: ConnectionEnvironment = { country: "NO", network: "test-network", provider: "test-provider", client: "test-client", platform: "android", softwareVersion: "1.0" };
function evidence(country = "NO"): ConnectionEvidence {
 return { environment: { ...environment, country }, checkedAt: now.toISOString(), expiresAt: new Date(now.getTime()+60_000).toISOString(), recipientNeedsInstallation: false,
  checks: REQUIRED_CONNECTION_CHECKS.map(check=>({check,outcome:"passed",testReference:`test-run:${check}`})) };
}

test("every country starts unverified rather than inheriting generic worldwide support",()=>{
 const agent=new GlobalConnectionReadinessAgent();
 for(const country of ["NO","SE","IR","KW","IN","DE"]){
  const result=agent.assess({...environment,country},now);
  assert.equal(result.status,"unverified");assert.deepEqual(result.requiredChecks,[...REQUIRED_CONNECTION_CHECKS]);
 }
});

test("verified evidence applies only to its exact country network and software environment",()=>{
 const agent=new GlobalConnectionReadinessAgent();agent.record(evidence(),now);
 assert.equal(agent.assess({...environment,country:" no "},now).status,"verified");
 for(const patch of [{country:"SE"},{network:"other"},{provider:"other"},{client:"other"},{platform:"ios"},{softwareVersion:"2.0"}]){
  assert.equal(agent.assess({...environment,...patch},now).status,"unverified");
 }
});

test("missing tests failed tests and recipient installation block readiness",()=>{
 for(const kind of ["missing","failed","installation"]){
  const agent=new GlobalConnectionReadinessAgent(),input=evidence();
  if(kind==="missing")input.checks.pop();
  if(kind==="failed")input.checks[0].outcome="failed";
  if(kind==="installation")input.recipientNeedsInstallation=true;
  agent.record(input,now);assert.equal(agent.assess(environment,now).status,"not-ready");
 }
});

test("restricted paths remain visible without being declared ready",()=>{
 const agent=new GlobalConnectionReadinessAgent(),input=evidence("IR");input.checks[0].outcome="restricted";
 agent.record(input,now);assert.equal(agent.assess(input.environment,now).status,"restricted");
});

test("expired or future-dated evidence cannot establish readiness",()=>{
 const agent=new GlobalConnectionReadinessAgent(),input=evidence();agent.record(input,now);
 assert.equal(agent.assess(environment,new Date(input.expiresAt)).status,"unverified");
 assert.equal(agent.assess(environment,new Date(now.getTime()-1)).status,"unverified");
 input.checkedAt=new Date(now.getTime()+1).toISOString();
 assert.throws(()=>agent.record(input,now),/INVALID_CONNECTION_EVIDENCE_WINDOW/);
});

test("old records and caller mutation cannot overwrite current readiness",()=>{
 const agent=new GlobalConnectionReadinessAgent(),input=evidence();agent.record(input,now);
 input.checks[0].outcome="failed";input.environment.country="SE";
 assert.equal(agent.assess(environment,now).status,"verified");
 const older=evidence();older.checkedAt=new Date(now.getTime()-1).toISOString();
 assert.throws(()=>agent.record(older,now),/STALE_CONNECTION_EVIDENCE/);
 const result=agent.assess(environment,now);result.environment.country="SE";
 assert.equal(agent.assess(environment,now).status,"verified");
});

test("evidence requires unique referenced tests and bounded freshness",()=>{
 const agent=new GlobalConnectionReadinessAgent(),input=evidence();input.checks.push(input.checks[0]);
 assert.throws(()=>agent.record(input,now),/INVALID_CONNECTION_TEST_EVIDENCE/);
 const missingReference=evidence();missingReference.checks[0].testReference="";
 assert.throws(()=>agent.record(missingReference,now),/INVALID_CONNECTION_TEST_EVIDENCE/);
 const stale=evidence();stale.expiresAt=new Date(now.getTime()+25*60*60*1000).toISOString();
 assert.throws(()=>agent.record(stale,now),/INVALID_CONNECTION_EVIDENCE_WINDOW/);
});
test("invalidated evidence stays unverified until a new record replaces it",()=>{
 const agent=new GlobalConnectionReadinessAgent();let current=true;
 agent.record(evidence(),now,()=>current);assert.equal(agent.assess(environment,now).status,"verified");
 current=false;assert.equal(agent.assess(environment,now).status,"unverified");
 current=true;assert.equal(agent.assess(environment,now).status,"unverified");
 agent.record(evidence(),now,()=>current);assert.equal(agent.assess(environment,now).status,"verified");
});
test("failed evidence-source guards invalidate readiness without leaking exception details",()=>{
 const agent=new GlobalConnectionReadinessAgent();agent.record(evidence(),now,()=>{throw new Error("PRIVATE_ADAPTER_DETAIL");});
 const result=agent.assess(environment,now);assert.equal(result.status,"unverified");assert.deepEqual(result.requiredChecks,[...REQUIRED_CONNECTION_CHECKS]);
 assert.deepEqual(result.reasons,["EVIDENCE_SOURCE_INVALIDATED"]);assert.equal(JSON.stringify(result).includes("PRIVATE_ADAPTER_DETAIL"),false);
});
