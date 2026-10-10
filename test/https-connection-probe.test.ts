import assert from "node:assert/strict";
import test from "node:test";
import { HttpsConnectionProbe } from "../src/email/https-connection-probe.js";
import { HEALTH_PROBE_HEADER, HEALTH_PROBE_VALUE } from "../src/http/health-contract.js";
import { GlobalConnectionReadinessAgent, type ConnectionEnvironment } from "../src/email/global-connection-readiness-agent.js";
import { GlobalConnectionValidationRunner } from "../src/email/global-connection-validation-runner.js";
const environment: ConnectionEnvironment={country:"NO",network:"test-network",provider:"test-provider",client:"test-client",platform:"android",softwareVersion:"1.0"};
const vantage={country:"NO",network:"test-network"};
const healthy=()=>new Response(null,{status:200,headers:{[HEALTH_PROBE_HEADER]:HEALTH_PROBE_VALUE}});

test("HTTPS probe requires the expected service identity and records its vantage",async()=>{
 const controller=new AbortController();
 const probe=new HttpsConnectionProbe("https://service.example/health",vantage,async(input,init)=>{
  assert.equal(String(input),"https://service.example/health");assert.equal(init?.method,"HEAD");
  assert.equal(init?.redirect,"error");assert.equal(init?.credentials,"omit");assert.equal(init?.cache,"no-store");assert.equal(init?.signal,controller.signal);
  return healthy();
 });
 const result=await probe.run(environment,controller.signal);assert.equal(result.outcome,"passed");
 const receipt=probe.receipt(result.testReference)!;assert.equal(receipt.country,"NO");assert.equal(receipt.reason,"EXPECTED_SERVICE_REACHED");
 receipt.country="SE";assert.equal(probe.receipt(result.testReference)?.country,"NO");
});

test("country or network mismatch makes no request and cannot establish readiness",async()=>{
 let calls=0;
 const probe=new HttpsConnectionProbe("https://service.example/health",vantage,async()=>{calls++;return healthy();});
 for(const patch of [{country:"SE"},{network:"different-network"}]){
  const result=await probe.run({...environment,...patch},new AbortController().signal);
  assert.equal(result.outcome,"failed");assert.equal(probe.receipt(result.testReference)?.reason,"VANTAGE_MISMATCH");
 }
 assert.equal(calls,0);
});

test("unexpected pages and blocked responses cannot pass the network check",async()=>{
 for(const status of [200,302,403,451,503]){
  const probe=new HttpsConnectionProbe("https://service.example/health",vantage,async()=>new Response(null,{status}));
  const result=await probe.run(environment,new AbortController().signal);
  assert.equal(result.outcome,status===403||status===451?"restricted":"failed");
 }
});

test("network or TLS failure records no private exception details",async()=>{
 const probe=new HttpsConnectionProbe("https://service.example/health",vantage,async()=>{throw new Error("PRIVATE_TLS_DETAILS");});
 const result=await probe.run(environment,new AbortController().signal);
 assert.equal(result.outcome,"failed");assert.equal(JSON.stringify(probe.receipt(result.testReference)).includes("PRIVATE_TLS_DETAILS"),false);
});

test("cancelled network probes send no request or publish a receipt",async()=>{
 const controller=new AbortController();controller.abort();let calls=0;
 const probe=new HttpsConnectionProbe("https://service.example/health",vantage,async()=>{calls++;return healthy();});
 await assert.rejects(probe.run(environment,controller.signal),{name:"AbortError"});assert.equal(calls,0);
});

test("only network evidence leaves the other worldwide readiness tools missing",async()=>{
 const probe=new HttpsConnectionProbe("https://service.example/health",vantage,async()=>healthy());
 const result=await new GlobalConnectionValidationRunner(new GlobalConnectionReadinessAgent(),{"dns-tls":probe}).run(environment);
 assert.equal(result.assessment.status,"not-ready");assert.equal(result.assessment.requiredChecks.includes("dns-tls"),false);
 assert.equal(result.missingTools.includes("email-delivery"),true);assert.equal(result.missingTools.includes("recipient-download"),true);
});

test("probe configuration rejects plaintext credentials and query secrets",()=>{
 for(const url of ["http://service.example/health","https://user:secret@service.example/health","https://service.example/health?token=secret","https://service.example/health#fragment"]){
  assert.throws(()=>new HttpsConnectionProbe(url,vantage),/INVALID_NETWORK_PROBE_CONFIGURATION/);
 }
});


test("abort during a request rejects even if the HTTP client returns a response",async()=>{
 const controller=new AbortController();
 const probe=new HttpsConnectionProbe("https://service.example/health",vantage,async()=>{controller.abort();return healthy();});
 await assert.rejects(probe.run(environment,controller.signal),{name:"AbortError"});
});

test("continuous probing retains a bounded receipt history",async()=>{
 const probe=new HttpsConnectionProbe("https://service.example/health",vantage,async()=>healthy());
 const first=await probe.run(environment,new AbortController().signal);
 let latest=first;
 for(let n=0;n<1000;n++)latest=await probe.run(environment,new AbortController().signal);
 assert.equal(probe.receipt(first.testReference),undefined);
 assert.equal(probe.receipt(latest.testReference)?.outcome,"passed");
});
