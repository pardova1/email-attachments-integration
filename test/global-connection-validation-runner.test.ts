import assert from "node:assert/strict";
import test from "node:test";
import { GlobalConnectionReadinessAgent, REQUIRED_CONNECTION_CHECKS, type ConnectionCheck, type ConnectionEnvironment } from "../src/email/global-connection-readiness-agent.js";
import { GlobalConnectionValidationRunner, type ConnectionProbeTool } from "../src/email/global-connection-validation-runner.js";
const environment: ConnectionEnvironment={country:"SE",network:"test-network",provider:"test-provider",client:"test-client",platform:"android",softwareVersion:"1.0"};
function tools(): Record<ConnectionCheck,ConnectionProbeTool>{
 const configured={} as Record<ConnectionCheck,ConnectionProbeTool>;
 for(const check of REQUIRED_CONNECTION_CHECKS){
  configured[check]={id:`tool-${check}`,async run(){return {outcome:"passed",testReference:"test-run",...(check==="recipient-download"?{recipientNeedsInstallation:false}:{})};}};
 }
 return configured;
}

test("configured probes produce environment-specific verified evidence",async()=>{
 const agent=new GlobalConnectionReadinessAgent();
 const result=await new GlobalConnectionValidationRunner(agent,tools()).run(environment);
 assert.equal(result.assessment.status,"verified");assert.deepEqual(result.missingTools,[]);
 assert.equal(agent.assess({...environment,country:"NO"}).status,"unverified");
});

test("missing tools stay visible and cannot produce readiness",async()=>{
 const result=await new GlobalConnectionValidationRunner(new GlobalConnectionReadinessAgent(),{}).run(environment);
 assert.equal(result.assessment.status,"not-ready");assert.deepEqual(result.missingTools,[...REQUIRED_CONNECTION_CHECKS]);
 assert.ok(result.assessment.reasons.includes("RECIPIENT_INSTALLATION_UNVERIFIED"));
});

test("failed malformed and restricted probes do not stop remaining validation",async()=>{
 const configured=tools();let downloadRan=false;
 configured["dns-tls"].run=async()=>{throw new Error("PRIVATE_PROVIDER_DETAILS");};
 configured["email-delivery"].run=async()=>({outcome:"passed",testReference:""});
 configured["upload"].run=async()=>({outcome:"restricted",testReference:"restricted-run"});
 configured["recipient-download"].run=async()=>{downloadRan=true;return {outcome:"passed",testReference:"download",recipientNeedsInstallation:false};};
 const result=await new GlobalConnectionValidationRunner(new GlobalConnectionReadinessAgent(),configured).run(environment);
 assert.equal(downloadRan,true);assert.equal(result.assessment.status,"restricted");
 assert.deepEqual(result.assessment.requiredChecks,["dns-tls","email-delivery","upload"]);
 assert.equal(JSON.stringify(result).includes("PRIVATE_PROVIDER_DETAILS"),false);
});

test("timeout releases an uncooperative probe and signals cancellation",async()=>{
 const configured=tools();let probeSignal:AbortSignal|undefined;
 configured["dns-tls"].run=async(_env,signal)=>{probeSignal=signal;return new Promise(()=>{});};
 const result=await new GlobalConnectionValidationRunner(new GlobalConnectionReadinessAgent(),configured,10).run(environment);
 assert.equal(probeSignal?.aborted,true);assert.equal(result.assessment.status,"not-ready");
 assert.deepEqual(result.assessment.requiredChecks,["dns-tls"]);
});

test("caller cancellation stops validation without publishing partial evidence",async()=>{
 const configured=tools(),agent=new GlobalConnectionReadinessAgent(),controller=new AbortController();
 let entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});
 configured["dns-tls"].run=async()=>{entered();return new Promise(()=>{});};
 const running=new GlobalConnectionValidationRunner(agent,configured).run(environment,controller.signal);
 await started;controller.abort();await assert.rejects(running,{name:"AbortError"});
 assert.equal(agent.assess(environment).status,"unverified");
});

test("successful download without installation evidence remains unready",async()=>{
 const configured=tools();configured["recipient-download"].run=async()=>({outcome:"passed",testReference:"download"});
 const result=await new GlobalConnectionValidationRunner(new GlobalConnectionReadinessAgent(),configured).run(environment);
 assert.equal(result.assessment.status,"not-ready");assert.ok(result.assessment.reasons.includes("RECIPIENT_INSTALLATION_UNVERIFIED"));
});

test("probe mutation cannot change environment identity for later checks",async()=>{
 const configured=tools();configured["dns-tls"].run=async(env)=>{env.country="IR";return {outcome:"passed",testReference:"run"};};
 configured["email-delivery"].run=async(env)=>{assert.equal(env.country,"SE");return {outcome:"passed",testReference:"run"};};
 const result=await new GlobalConnectionValidationRunner(new GlobalConnectionReadinessAgent(),configured).run(environment);
 assert.equal(result.assessment.environment.country,"SE");assert.equal(environment.country,"SE");
});

test("long validation cannot renew evidence from its completion time",async()=>{
 const start=new Date("2026-10-10T00:00:00Z");let clockReads=0;
 const result=await new GlobalConnectionValidationRunner(new GlobalConnectionReadinessAgent(),tools(),10_000,1000,()=>new Date(start.getTime()+(clockReads++?1000:0))).run(environment);
 assert.equal(result.assessment.status,"unverified");
 assert.ok(result.assessment.reasons.includes("EVIDENCE_EXPIRED"));
});

test("already cancelled validation invokes no probe",async()=>{
 const configured=tools(),controller=new AbortController();let calls=0;
 configured["dns-tls"].run=async()=>{calls++;throw new Error("MUST_NOT_RUN");};controller.abort();
 await assert.rejects(new GlobalConnectionValidationRunner(new GlobalConnectionReadinessAgent(),configured).run(environment,controller.signal),{name:"AbortError"});
 assert.equal(calls,0);
});
