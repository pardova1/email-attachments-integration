import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {createConnectionCheckRouter,type ConnectionCheckRouterOptions} from "../src/http/connection-check-router.js";
import {AutomaticConnectionCoordinator} from "../src/email/automatic-connection-coordinator.js";
import {CustomerConnectionFallback} from "../src/email/customer-connection-fallback.js";
import {GlobalConnectionReadinessAgent,REQUIRED_CONNECTION_CHECKS,type ConnectionCheck} from "../src/email/global-connection-readiness-agent.js";
import type {ConnectionProbeTool} from "../src/email/global-connection-validation-runner.js";
const known={network:"test-network",provider:"test-provider",client:"test-browser",platform:"android",softwareVersion:"1.0"};
const authenticator={async authenticate(value:string|undefined){if(value!=="Bearer sender-a"&&value!=="Bearer sender-b")throw new Error("PRIVATE_AUTH_DETAIL");return {userId:value.slice(7)};}};
async function withServer(options:ConnectionCheckRouterOptions,run:(url:string)=>Promise<void>){
 const app=express();app.use(express.json({limit:"8kb"}));app.use("/v1/connection",createConnectionCheckRouter(options));
 const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));
 const address=server.address();if(!address||typeof address==="string")throw new Error("TEST_ADDRESS_REQUIRED");
 try{await run(`http://127.0.0.1:${address.port}/v1/connection`);}
 finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}
const post=(url:string,body:unknown,token="sender-a",extra:Record<string,string>={})=>fetch(url,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${token}`,...extra},body:JSON.stringify(body)});
function tools(){const result={} as Record<ConnectionCheck,ConnectionProbeTool>;for(const check of REQUIRED_CONNECTION_CHECKS)result[check]={id:check,async run(){return {outcome:"passed",testReference:"synthetic",...(check==="recipient-download"?{recipientNeedsInstallation:false}:{})};}};return result;}

test("HTTP checks authenticate and return localized missing details bound to their customer",async()=>{
 const fallback=new CustomerConnectionFallback({country:[{id:"kw",label:"Kuwait",value:"KW"}]});let requested=0;
 await withServer({authenticator,async coordinatorFor(customer,context){assert.equal(context.networkAddress,"127.0.0.1");assert.ok(context.requestReference.startsWith("connection-request:"));return new AutomaticConnectionCoordinator({async discover(){return {environment:known,observedAt:new Date().toISOString(),sourceReference:"synthetic"};}},{async toolsFor(){requested++;return tools();}},new GlobalConnectionReadinessAgent(),undefined,10_000,fallback,customer.userId);}},async url=>{
  const response=await post(`${url}/check`,{language:"fa-IR"});assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"no-store");
  const result=await response.json();assert.equal(result.language,"fa");assert.equal(result.direction,"rtl");assert.equal(result.form.fields[0].label,"کشور");assert.equal(result.languageOptions.length,38);assert.equal(JSON.stringify(result).includes("sender-a"),false);
  const denied=await post(`${url}/selections`,{formId:result.form.id,selections:{country:"kw"}},"sender-b");assert.equal(denied.status,400);assert.deepEqual(await denied.json(),{error:"CONNECTION_SELECTION_REJECTED"});assert.equal(requested,0);
  const accepted=await post(`${url}/selections`,{formId:result.form.id,selections:{country:"kw"},language:"ar-KW"});assert.equal(accepted.status,200);const checked=await accepted.json();assert.equal(checked.language,"ar");assert.equal(checked.validation.assessment.status,"verified");assert.equal(requested,1);
 });
});
test("missing invalid and cookie-only credentials cannot invoke discovery",async()=>{
 let called=0;
 await withServer({authenticator,async coordinatorFor(){called++;throw new Error("UNEXPECTED");}},async url=>{
  for(const headers of [{},{cookie:"session=sender-a"},{authorization:"Bearer invalid"}] as Record<string,string>[]){
   const response=await fetch(`${url}/check`,{method:"POST",headers:{"content-type":"application/json",...headers},body:"{}"});assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:"SENDER_AUTHENTICATION_REQUIRED"});
  }
  assert.equal(called,0);
 });
});
test("body identity fields unknown selections and untrusted origins are rejected",async()=>{
 let called=0;
 await withServer({authenticator,allowedOrigins:["https://app.example"],async coordinatorFor(){called++;throw new Error("UNEXPECTED");}},async url=>{
  for(const body of [{customerScope:"sender-b"},{country:"KW"},{software:{country:"KW"}}])assert.equal((await post(`${url}/check`,body)).status,400);
  assert.equal((await post(`${url}/selections`,{formId:"invalid",selections:{country:"kw"}})).status,400);
  assert.equal((await post(`${url}/check`,{},"sender-a",{origin:"https://attacker.example"})).status,403);
  const unsupported=await fetch(`${url}/check`,{method:"POST",headers:{authorization:"Bearer sender-a","content-type":"text/plain"},body:"{}"});assert.equal(unsupported.status,415);
  assert.equal(called,0);
 });
});
test("unconfigured adapters and mismatched coordinator scope remain unavailable",async()=>{
 await withServer({authenticator},async url=>{const response=await post(`${url}/check`,{});assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:"CONNECTION_CHECK_UNAVAILABLE"});});
 await withServer({authenticator,async coordinatorFor(){return new AutomaticConnectionCoordinator({async discover(){throw new Error("UNEXPECTED");}},{async toolsFor(){return tools();}},new GlobalConnectionReadinessAgent(),undefined,10_000,undefined,"sender-b");}},async url=>{assert.equal((await post(`${url}/check`,{})).status,503);});
});
test("timed-out requests abort adapters and return no private errors",async()=>{
 let signal:AbortSignal|undefined;
 await withServer({authenticator,timeoutMs:20,async coordinatorFor(_customer,_context,received){signal=received;return new Promise(()=>{});}},async url=>{
  const response=await post(`${url}/check`,{});assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:"CONNECTION_CHECK_UNAVAILABLE"});assert.equal(signal?.aborted,true);
 });
});
test("software hints are forwarded separately from authenticated identity",async()=>{
 await withServer({authenticator,allowedOrigins:["https://app.example"],async coordinatorFor(customer,context){assert.equal(customer.userId,"sender-a");assert.deepEqual(context.softwareHints,{client:"browser",platform:"android",softwareVersion:"1.0"});return new AutomaticConnectionCoordinator({async discover(){return {environment:{...known,country:"KW"},observedAt:new Date().toISOString(),sourceReference:"synthetic"};}},{async toolsFor(){return {};}},new GlobalConnectionReadinessAgent(),undefined,10_000,undefined,customer.userId);}},async url=>{
  const response=await post(`${url}/check`,{software:{client:"browser",platform:"android",softwareVersion:"1.0"}},"sender-a",{origin:"https://app.example","x-forwarded-for":"private-spoofed-address"});assert.equal(response.status,200);assert.equal((await response.json()).validation.assessment.status,"not-ready");
 });
});
test("client disconnect aborts a pending connection adapter",async()=>{
 const {request}=await import("node:http");let entered!:()=>void,stopped!:()=>void;
 const started=new Promise<void>(resolve=>{entered=resolve;}),cancelled=new Promise<void>(resolve=>{stopped=resolve;});
 await withServer({authenticator,async coordinatorFor(_customer,_context,signal){signal.addEventListener("abort",stopped,{once:true});entered();return new Promise(()=>{});}},async url=>{
  const pending=request(`${url}/check`,{method:"POST",headers:{authorization:"Bearer sender-a","content-type":"application/json"}},()=>{});pending.on("error",()=>{});pending.end("{}");
  await started;pending.destroy();await cancelled;
 });
});
