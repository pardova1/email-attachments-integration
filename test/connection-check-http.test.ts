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
  const result=await response.json();assert.equal(result.language,"fa");assert.equal(result.direction,"rtl");assert.equal(result.form.fields[0].label,"کشور");assert.equal(result.languageOptions.length,42);assert.equal(JSON.stringify(result).includes("sender-a"),false);
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
test("request deadline cancels the sender authentication transport before discovery",async()=>{
 const {SupabaseSenderAuthenticator}=await import("../src/security/supabase-sender-authenticator.js");let received:AbortSignal|null|undefined,discoveryCalls=0;
 const auth=new SupabaseSenderAuthenticator("https://example.supabase.co","publishable",async(_url,init)=>{received=init?.signal;return new Promise(()=>{});});
 await withServer({authenticator:auth,timeoutMs:100,async coordinatorFor(){discoveryCalls++;throw new Error("UNEXPECTED");}},async url=>{
  const response=await post(`${url}/check`,{});assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:"CONNECTION_CHECK_UNAVAILABLE"});assert.equal(received?.aborted,true);assert.equal(discoveryCalls,0);
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


test("HTTP language extensions preserve authenticated country choices and localized submission responses",async()=>{
 const {CONNECTION_TRANSLATIONS}=await import("../src/email/connection-languages.js");
 const translations={en:structuredClone(CONNECTION_TRANSLATIONS.en),bn:{...structuredClone(CONNECTION_TRANSLATIONS.en),language:"বাংলা",message:"সংযোগের তথ্য নির্বাচন করুন।",difficultyNotice:"পরে আবার চেষ্টা করুন।",fields:{...CONNECTION_TRANSLATIONS.en.fields,country:"দেশ"}}};
 const fallback=new CustomerConnectionFallback({country:[{id:"no",label:"Norway",value:"NO"}]});
 await withServer({authenticator,translations,async coordinatorFor(customer){return new AutomaticConnectionCoordinator({async discover(){return {environment:known,observedAt:new Date().toISOString(),sourceReference:"synthetic"};}},{async toolsFor(){return {};}},new GlobalConnectionReadinessAgent(),undefined,10_000,fallback,customer.userId);}},async url=>{
  translations.bn.message="changed outside router";
  const result=await (await post(`${url}/check`,{language:"bn-BD"})).json();assert.equal(result.language,"bn");assert.equal(result.form.message,"সংযোগের তথ্য নির্বাচন করুন।");assert.equal(result.form.fields[0].label,"দেশ");assert.equal(result.form.fields[0].options[0].value,"NO");assert.equal(result.form.fields[0].options[0].label,new Intl.DisplayNames(["bn"],{type:"region"}).of("NO"));assert.deepEqual(result.languageOptions.map((item:{tag:string})=>item.tag),["en","bn"]);
  const checked=await (await post(`${url}/selections`,{language:"bn-BD",formId:result.form.id,selections:{country:"no"}})).json();assert.equal(checked.language,"bn");assert.equal(checked.validation.assessment.environment.country,"NO");assert.equal(checked.retryRequired,true);
  const unsupported=await (await post(`${url}/check`,{language:"is-IS"})).json();assert.equal(unsupported.language,"en");
 });
});
test("HTTP configuration rejects incomplete added languages before requests",async()=>{
 const {CONNECTION_TRANSLATIONS}=await import("../src/email/connection-languages.js");
 assert.throws(()=>createConnectionCheckRouter({authenticator,translations:{bn:{...CONNECTION_TRANSLATIONS.en,language:"বাংলা"}}}),/CONNECTION_DIFFICULTY_TRANSLATION_REQUIRED/);
 assert.throws(()=>createConnectionCheckRouter({authenticator,translations:{}}),/EMPTY_CONNECTION_LANGUAGE_CATALOG/);
});


test("HTTP language preferences respect quality weights and explicit customer choices",async()=>{
 const fallback=new CustomerConnectionFallback({country:[{id:"no",label:"Norway",value:"NO"}]});
 await withServer({authenticator,async coordinatorFor(customer){return new AutomaticConnectionCoordinator({async discover(){return {environment:known,observedAt:new Date().toISOString(),sourceReference:"synthetic"};}},{async toolsFor(){return {};}},new GlobalConnectionReadinessAgent(),undefined,10_000,fallback,customer.userId);}},async url=>{
  for(const [header,body,expected] of [["is-IS,sv-SE;q=0.5,fa-IR;q=0.9",{},"fa"],["ar-KW;q=0,sw-KE;q=0.8",{},"sw"],["ar-KW",{language:"nb-NO"},"nb"],["*;q=1,invalid_tag;q=2",{},"en"]] as const){
   const response=await post(`${url}/check`,body,"sender-a",{"accept-language":header});const result=await response.json();assert.equal(result.language,expected);assert.equal(response.headers.get("content-language"),expected);assert.equal(result.form.fields[0].options[0].value,"NO");
  }
 });
});
test("language header parsing is bounded stable and excludes malformed or zero-quality ranges",async()=>{
 const {connectionLanguagePreferences}=await import("../src/http/connection-language-preferences.js");
 assert.deepEqual(connectionLanguagePreferences("sv;q=0.4,fa;q=1,ar;q=1,nb;q=0,sw;q=0.800"),["fa","ar","sw","sv"]);
 assert.deepEqual(connectionLanguagePreferences("en;q=1.1,fr;q=-1,de;q=0.1234,fa;q=0.5;q=1,ar;q=NaN,*"),[]);
 assert.deepEqual(connectionLanguagePreferences(undefined),[]);assert.deepEqual(connectionLanguagePreferences("a".repeat(4097)),[]);
 assert.equal(connectionLanguagePreferences(Array(60).fill("en").join(",")).length,50);
});

function capacityCoordinator(customer:{userId:string}){return new AutomaticConnectionCoordinator({async discover(){return {environment:{...known,country:"KW"},observedAt:new Date().toISOString(),sourceReference:"synthetic"};}},{async toolsFor(){return {};}},new GlobalConnectionReadinessAgent(),undefined,10_000,undefined,customer.userId);}
test("overlapping requests share a snapshotted customer limit while other customers can proceed",async()=>{
 const concurrency={perCustomer:1,total:100};
 let entered!:()=>void,release!:()=>void,calls=0;const started=new Promise<void>(resolve=>{entered=resolve;}),held=new Promise<void>(resolve=>{release=resolve;});
 await withServer({authenticator,concurrency,async coordinatorFor(customer){calls++;if(calls===1){entered();await held;}return capacityCoordinator(customer);}},async url=>{
  concurrency.perCustomer=10;concurrency.total=1000;
  const first=post(`${url}/check`,{});await started;
  try{
   for(const [path,body] of [["check",{}],["selections",{formId:"11111111-1111-4111-8111-111111111111",selections:{}}]] as const){const response=await post(`${url}/${path}`,{...body,language:"ar-KW"});assert.equal(response.status,503);assert.equal(response.headers.get("content-language"),"ar");assert.equal(response.headers.get("cache-control"),"no-store");assert.deepEqual(await response.json(),{status:"pending-internal-retry",retryRequired:true,reason:"AUTOMATIC_CONNECTION_CHECK_UNAVAILABLE",language:"ar"});}
   assert.equal(calls,1);assert.equal((await post(`${url}/check`,{},"sender-b")).status,200);assert.equal(calls,2);
  }finally{release();}
  assert.equal((await first).status,200);assert.equal((await post(`${url}/check`,{})).status,200);assert.equal(calls,3);
 });
});
test("global capacity rejects excess work and becomes available after the active check completes",async()=>{
 let entered!:()=>void,release!:()=>void,calls=0;const started=new Promise<void>(resolve=>{entered=resolve;}),held=new Promise<void>(resolve=>{release=resolve;});
 await withServer({authenticator,concurrency:{total:1},async coordinatorFor(customer){calls++;if(calls===1){entered();await held;}return capacityCoordinator(customer);}},async url=>{
  const first=post(`${url}/check`,{});await started;try{const response=await post(`${url}/check`,{},"sender-b");assert.equal(response.status,503);assert.equal(calls,1);}finally{release();}
  assert.equal((await first).status,200);assert.equal((await post(`${url}/check`,{},"sender-b")).status,200);assert.equal(calls,2);
 });
});
test("timeouts and setup failures release concurrency slots",async()=>{
 let calls=0;await withServer({authenticator,timeoutMs:100,concurrency:{total:1},async coordinatorFor(customer){calls++;if(calls===1)return new Promise(()=>{});if(calls===2)throw new Error("PRIVATE_SETUP_FAILURE");return capacityCoordinator(customer);}},async url=>{
  assert.equal((await post(`${url}/check`,{})).status,503);assert.equal((await post(`${url}/check`,{})).status,503);assert.equal((await post(`${url}/check`,{})).status,200);assert.equal(calls,3);
 });
});
test("invalid concurrency policies are rejected when the router is mounted",()=>{
 for(const concurrency of [{perCustomer:0},{perCustomer:11},{perCustomer:1.5},{total:0},{total:1001},{perCustomer:2,total:1}])assert.throws(()=>createConnectionCheckRouter({authenticator,concurrency}),/INVALID_CONNECTION_CONCURRENCY/);
});


test("temporary setup failures recover through the browser retry flow without customer settings",async()=>{
 const {ConnectionCheckClient}=await import("../src/client/connection-check-client.js");
 const {ConnectionFormModel}=await import("../src/client/connection-form-model.js");
 let attempts=0,tokens=0;
 await withServer({authenticator,async coordinatorFor(customer){attempts++;if(attempts===1)throw new Error("PRIVATE_SETUP_FAILURE");return capacityCoordinator(customer);}},async url=>{
  const responses:unknown[]=[];
  const client=new ConnectionCheckClient("https://app.example/v1/connection",async()=>{tokens++;return "sender-a";},async(target,init)=>{
   const response=await fetch(`${url}/${String(target).split("/").at(-1)}`,init);responses.push(await response.clone().json());return response;
  });
  const model=new ConnectionFormModel(client,"fa",undefined,undefined,{maxAttempts:2,delayMs:0});
  const phases:string[]=[];model.subscribe(state=>phases.push(state.phase));
  try{
   await model.check();assert.equal(attempts,2);assert.equal(tokens,2);assert.equal(model.state().phase,"assessed");
   assert.deepEqual(responses[0],{status:"pending-internal-retry",retryRequired:true,reason:"AUTOMATIC_CONNECTION_CHECK_UNAVAILABLE",language:"fa"});
   assert.equal(phases.includes("choosing"),false);assert.equal(phases.includes("unavailable"),false);
  }finally{model.dispose();}
 });
});

test("setup deadline returns localized internal retry and releases request capacity",async()=>{
 const {createConnectionCoordinatorFactory}=await import("../src/config/connection-coordinator-factory.js");
 let calls=0,setupSignal:AbortSignal|undefined;
 const coordinatorFor=createConnectionCoordinatorFactory({internalTimeoutMs:10,catalog:{async toolsFor(){return {};}},fallback:new CustomerConnectionFallback({}),async discoveryFor(_customer,_context,signal){
  calls++;setupSignal=signal;if(calls===1)return new Promise(()=>{});
  return {async discover(){return {environment:{...known,country:"KW"},observedAt:new Date().toISOString(),sourceReference:"synthetic"};}};
 }});
 await withServer({authenticator,coordinatorFor},async url=>{
  const response=await post(`${url}/selections`,{formId:"11111111-1111-4111-8111-111111111111",selections:{}},"sender-a",{"accept-language":"ar-KW"});
  assert.equal(response.status,503);assert.equal(response.headers.get("content-language"),"ar");assert.equal(response.headers.get("cache-control"),"no-store");
  assert.deepEqual(await response.json(),{status:"pending-internal-retry",retryRequired:true,reason:"AUTOMATIC_CONNECTION_CHECK_UNAVAILABLE",language:"ar"});assert.equal(setupSignal?.aborted,true);
  const recovered=await post(`${url}/check`,{});assert.equal(recovered.status,200);assert.equal((await recovered.json()).status,"assessed");assert.equal(calls,2);
 });
});


test("browser automatically recovers from global capacity without admitting excess work",async()=>{
 const {ConnectionCheckClient}=await import("../src/client/connection-check-client.js");
 const {ConnectionFormModel}=await import("../src/client/connection-form-model.js");
 let entered!:()=>void,release!:()=>void,calls=0;
 const started=new Promise<void>(resolve=>{entered=resolve;}),held=new Promise<void>(resolve=>{release=resolve;});
 await withServer({authenticator,concurrency:{total:1},async coordinatorFor(customer){calls++;if(calls===1){entered();await held;}return capacityCoordinator(customer);}},async url=>{
  const first=post(`${url}/check`,{});await started;
  let requests=0,tokens=0;const responses:unknown[]=[],phases:string[]=[];
  const client=new ConnectionCheckClient("https://app.example/v1/connection",async()=>{tokens++;return "sender-b";},async(target,init)=>{
   requests++;const response=await fetch(`${url}/${String(target).split("/").at(-1)}`,init);responses.push(await response.clone().json());
   if(requests===1){assert.equal(response.status,503);assert.equal(calls,1);release();assert.equal((await first).status,200);}
   return response;
  });
  const model=new ConnectionFormModel(client,"sw",undefined,undefined,{maxAttempts:2,delayMs:0});model.subscribe(state=>phases.push(state.phase));
  try{
   await model.check();assert.equal(requests,2);assert.equal(tokens,2);assert.equal(calls,2);assert.equal(model.state().phase,"assessed");
   assert.deepEqual(responses[0],{status:"pending-internal-retry",retryRequired:true,reason:"AUTOMATIC_CONNECTION_CHECK_UNAVAILABLE",language:"sw"});
   assert.equal(phases.includes("choosing"),false);assert.equal(phases.includes("unavailable"),false);
  }finally{release();await first;model.dispose();}
 });
});

test("persistent customer capacity exhausts bounded browser retries without starting adapters",async()=>{
 const {ConnectionCheckClient}=await import("../src/client/connection-check-client.js");
 const {ConnectionFormModel}=await import("../src/client/connection-form-model.js");
 let entered!:()=>void,release!:()=>void,calls=0;
 const started=new Promise<void>(resolve=>{entered=resolve;}),held=new Promise<void>(resolve=>{release=resolve;});
 await withServer({authenticator,async coordinatorFor(customer){calls++;if(calls===1){entered();await held;}return capacityCoordinator(customer);}},async url=>{
  const first=post(`${url}/check`,{});await started;let requests=0;
  const client=new ConnectionCheckClient("https://app.example/v1/connection",async()=>"sender-a",async(target,init)=>{requests++;return fetch(`${url}/${String(target).split("/").at(-1)}`,init);});
  const model=new ConnectionFormModel(client,"fa",undefined,undefined,{maxAttempts:2,delayMs:0});
  try{
   await model.check();assert.equal(requests,2);assert.equal(calls,1);assert.equal(model.state().phase,"unavailable");assert.equal(model.state().result?.status,"pending-internal-retry");
   release();await first;await model.check();assert.equal(model.state().phase,"assessed");assert.equal(calls,2);
  }finally{release();await first;model.dispose();}
 });
});
