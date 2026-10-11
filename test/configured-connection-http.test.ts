import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {createConfiguredConnectionCheckRouter,type ConfiguredConnectionCheckRouterOptions} from "../src/config/connection-check-router-factory.js";
import {CustomerConnectionFallback} from "../src/email/customer-connection-fallback.js";
import {ExactSoftwareConnectionCatalog} from "../src/email/exact-software-connection-catalog.js";
import {REQUIRED_CONNECTION_CHECKS,type ConnectionCheck} from "../src/email/global-connection-readiness-agent.js";
import type {ConnectionProbeTool} from "../src/email/global-connection-validation-runner.js";
const now=new Date("2026-10-11T00:00:00Z"),software={client:"Google Chrome",platform:"android",softwareVersion:"155.0.8000.1"};
const environment={country:"KW",network:"synthetic-network",provider:"gmail",...software};
const authenticator={async authenticate(value:string|undefined){if(!["Bearer sender-a","Bearer sender-b"].includes(value??""))throw new Error("PRIVATE_AUTH_ERROR");return {userId:value!.slice(7)};}};
const observed=(details:object)=>({details,observedAt:now.toISOString(),sourceReference:"synthetic-observation"});
function configuration(){
 const runs:ConnectionCheck[]=[];
 const tools={} as Record<ConnectionCheck,ConnectionProbeTool>;
 for(const check of REQUIRED_CONNECTION_CHECKS)tools[check]={id:check,async run(actual){assert.deepEqual(actual,environment);runs.push(check);return {outcome:"passed",testReference:`synthetic:${check}`,...(check==="recipient-download"?{recipientNeedsInstallation:false}:{})};}};
 const catalog=new ExactSoftwareConnectionCatalog([{id:"synthetic-profile",environment,reviewedAt:now.toISOString(),expiresAt:new Date(now.getTime()+60_000).toISOString(),sourceReference:"synthetic-profile-source",tools}],()=>now);
 return {runs,observations:{clock:()=>now,catalog,fallback:new CustomerConnectionFallback({provider:[{id:"gmail",label:"Gmail",value:"gmail"}]},()=>now),async network(customer:{userId:string},context:{networkAddress:string}){assert.equal(customer.userId,"sender-a");assert.equal(context.networkAddress,"127.0.0.1");return observed({country:"KW",network:environment.network});},async provider(){return observed({provider:"gmail"});}}};
}
async function withServer(options:ConfiguredConnectionCheckRouterOptions,run:(url:string)=>Promise<void>){
 const app=express();app.use(express.json({limit:"8kb"}));app.use("/v1/connection",createConfiguredConnectionCheckRouter(options));
 const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));const address=server.address();if(!address||typeof address==="string")throw new Error("TEST_ADDRESS_REQUIRED");
 try{await run(`http://127.0.0.1:${address.port}/v1/connection`);}finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}
const post=(url:string,body:unknown,token="sender-a")=>fetch(url,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${token}`},body:JSON.stringify(body)});
test("configured HTTP discovery requires every exact-profile probe before returning readiness",async()=>{
 const configured=configuration();await withServer({authenticator,observations:configured.observations},async url=>{
  const response=await post(`${url}/check`,{software,language:"ar-KW"}),result=await response.json();assert.equal(response.status,200);assert.equal(response.headers.get("content-language"),"ar");assert.equal(result.validation.assessment.status,"verified");assert.equal(result.retryRequired,false);assert.deepEqual(result.validation.assessment.environment,environment);assert.deepEqual(configured.runs,[...REQUIRED_CONNECTION_CHECKS]);
  const changed=await (await post(`${url}/check`,{software:{...software,softwareVersion:"156.0.9000.1"}})).json();assert.equal(changed.retryRequired,true);assert.equal(changed.validation.assessment.status,"not-ready");assert.equal(configured.runs.length,REQUIRED_CONNECTION_CHECKS.length);
 });
});
test("configured HTTP fallback preserves discoveries across requests and rejects another customer",async()=>{
 const configured=configuration();configured.observations.provider=async()=>observed({});await withServer({authenticator,observations:configured.observations},async url=>{
  const first=await (await post(`${url}/check`,{software,language:"fa-IR"})).json();assert.equal(first.language,"fa");assert.equal(first.direction,"rtl");assert.deepEqual(first.form.fields.map((field:{key:string})=>field.key),["provider"]);
  const body={software,formId:first.form.id,selections:{provider:"gmail"},language:"sw-KE"};assert.equal((await post(`${url}/selections`,body,"sender-b")).status,400);assert.equal(configured.runs.length,0);
  const accepted=await (await post(`${url}/selections`,body)).json();assert.equal(accepted.language,"sw");assert.equal(accepted.validation.assessment.status,"verified");assert.deepEqual(accepted.validation.assessment.environment,environment);assert.deepEqual(configured.runs,[...REQUIRED_CONNECTION_CHECKS]);
 });
});
test("unconfigured server composition and rejected authentication never claim readiness",async()=>{
 await withServer({authenticator},async url=>{const response=await post(`${url}/check`,{software});assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:"CONNECTION_CHECK_UNAVAILABLE"});});
 const configured=configuration();let calls=0;configured.observations.network=async()=>{calls++;throw new Error("UNEXPECTED");};await withServer({authenticator,observations:configured.observations},async url=>{const response=await post(`${url}/check`,{software},"invalid");assert.equal(response.status,401);assert.equal(calls,0);assert.equal(configured.runs.length,0);});
});
test("HTTP deadline cancels composed observation sources without running probes",async()=>{
 const configured=configuration();let sourceSignal:AbortSignal|undefined;configured.observations.network=async(_customer,_context,signal?:AbortSignal)=>{sourceSignal=signal;return new Promise(()=>{});};
 await withServer({authenticator,timeoutMs:100,observations:configured.observations},async url=>{const response=await post(`${url}/check`,{software});assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:"CONNECTION_CHECK_UNAVAILABLE"});assert.equal(sourceSignal?.aborted,true);assert.equal(configured.runs.length,0);});
});

test("HTTP selection refresh cannot validate a saved software version after a change",async()=>{
 const configured=configuration();configured.observations.provider=async()=>observed({});
 await withServer({authenticator,observations:configured.observations},async url=>{
  const first=await (await post(`${url}/check`,{software})).json(),current={...software,softwareVersion:"156.0.9000.1"};
  const renewed=await (await post(`${url}/selections`,{formId:first.form.id,selections:{provider:"gmail"},software:current})).json();assert.equal(renewed.status,"customer-input-required");assert.notEqual(renewed.form.id,first.form.id);assert.deepEqual(renewed.form.fields.map((field:{key:string})=>field.key),["provider"]);assert.equal(configured.runs.length,0);
  const checked=await (await post(`${url}/selections`,{formId:renewed.form.id,selections:{provider:"gmail"},software:current})).json();assert.equal(checked.validation.assessment.status,"not-ready");assert.equal(checked.validation.assessment.environment.softwareVersion,current.softwareVersion);assert.equal(configured.runs.length,0);
 });
});

test("HTTP source failure stays private and recovery to unknown details offers only missing dropdowns",async()=>{
 const configured=configuration();let failed=true;configured.observations.provider=async()=>{if(failed)throw new Error("PRIVATE_ACCOUNT_SOURCE_ERROR");return observed({});};
 await withServer({authenticator,observations:configured.observations},async url=>{
  const response=await post(`${url}/check`,{software,language:"ar-KW"}),result=await response.json();assert.equal(response.status,503);assert.equal(result.status,"pending-internal-retry");assert.equal(result.language,"ar");assert.equal(result.form,undefined);assert.equal(result.retryFields,undefined);assert.equal(JSON.stringify(result).includes("PRIVATE_ACCOUNT_SOURCE_ERROR"),false);assert.equal(configured.runs.length,0);
  failed=false;const recovered=await post(`${url}/check`,{software,language:"ar-KW"}),form=await recovered.json();assert.equal(recovered.status,200);assert.equal(form.status,"customer-input-required");assert.deepEqual(form.form.fields.map((field:{key:string})=>field.key),["provider"]);
 });
});

test("HTTP discovery recovers a temporary provider failure in the same request before probing",async()=>{
 const configured=configuration();let attempts=0;configured.observations.provider=async()=>{attempts++;if(attempts===1)throw new Error("TEMPORARY_PROVIDER_ERROR");return observed({provider:"gmail"});};
 await withServer({authenticator,observations:{...configured.observations,sourceRetry:{delayMs:0}}},async url=>{
  const response=await post(`${url}/check`,{software}),result=await response.json();assert.equal(response.status,200);assert.equal(result.status,"assessed");assert.equal(result.validation.assessment.status,"verified");assert.equal(result.retryRequired,false);assert.equal(attempts,2);assert.deepEqual(configured.runs,[...REQUIRED_CONNECTION_CHECKS]);
 });
});
test("exact profile catalogs automatically supply fallback choices without a separate operator list",async()=>{
 const configured=configuration(),{fallback:_fallback,...observations}=configured.observations;observations.provider=async()=>observed({});
 await withServer({authenticator,observations},async url=>{
  const first=await (await post(`${url}/check`,{software,language:"ar-KW"})).json();assert.equal(first.status,"customer-input-required");assert.deepEqual(first.form.fields.map((field:{key:string})=>field.key),["provider"]);assert.equal(first.form.fields[0].options[0].value,"gmail");
  const checked=await (await post(`${url}/selections`,{software,formId:first.form.id,selections:{provider:first.form.fields[0].options[0].id}})).json();assert.equal(checked.validation.assessment.status,"verified");assert.deepEqual(configured.runs,[...REQUIRED_CONNECTION_CHECKS]);
 });
});
test("authenticated HTTP requests use their customer catalog even for identical environments",async()=>{
 const configured=configuration(),scopes:string[]=[];let fail=false;
 await withServer({authenticator,observations:{...configured.observations,async network(){return observed({country:"KW",network:environment.network});},async catalogFor(customer,context,signal){signal.throwIfAborted();scopes.push(customer.userId);assert.deepEqual(context.softwareHints,software);if(fail)throw new Error("PRIVATE_ACCOUNT_ADAPTER_ERROR");return customer.userId==="sender-a"?configured.observations.catalog:{async toolsFor(){return {};}};}}},async url=>{
  const first=await (await post(`${url}/check`,{software},"sender-a")).json();assert.equal(first.validation.assessment.status,"verified");
  const second=await (await post(`${url}/check`,{software},"sender-b")).json();assert.equal(second.validation.assessment.status,"not-ready");assert.equal(configured.runs.length,REQUIRED_CONNECTION_CHECKS.length);assert.deepEqual(scopes,["sender-a","sender-b"]);
  fail=true;const failed=await post(`${url}/check`,{software},"sender-b");assert.equal(failed.status,503);assert.equal(JSON.stringify(await failed.json()).includes("PRIVATE_ACCOUNT_ADAPTER_ERROR"),false);assert.equal(configured.runs.length,REQUIRED_CONNECTION_CHECKS.length);
 });
});
