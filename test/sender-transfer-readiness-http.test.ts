import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {createSenderTransferRouter,type SenderTransferRouterOptions} from "../src/http/sender-transfer-router.js";
import {AutomaticConnectionCoordinator} from "../src/email/automatic-connection-coordinator.js";
import {CustomerConnectionFallback} from "../src/email/customer-connection-fallback.js";
import {GlobalConnectionReadinessAgent,REQUIRED_CONNECTION_CHECKS,type ConnectionCheck} from "../src/email/global-connection-readiness-agent.js";
import type {ConnectionProbeTool} from "../src/email/global-connection-validation-runner.js";
import {MemoryStorage} from "../src/adapters/memory-storage.js";
import {MemoryLicenseRepository} from "../src/adapters/memory-license-repository.js";
import {createAnnualLicense} from "../src/billing/annual-license.js";
import {EntitlementService} from "../src/billing/entitlement-service.js";
import {SendAuthorizationService} from "../src/services/send-authorization-service.js";
import {TransferService} from "../src/services/transfer-service.js";
import {SenderTransferAccessService} from "../src/services/sender-transfer-access.js";
const input={fileName:"video.mp4",contentType:"video/mp4",totalBytes:1024,originalSha256:"a".repeat(64),senderExpirationConfirmed:true};
const environment={country:"NO",network:"test-network",provider:"test-provider",client:"test-client",platform:"android",softwareVersion:"1.0"};
const authenticator={async authenticate(value:string|undefined){if(value!=="Bearer sender-a"&&value!=="Bearer sender-b")throw new Error("PRIVATE_AUTH_DETAIL");return {userId:value.slice(7)};}};
async function configuration(){
 let now=new Date("2026-10-12T14:00:00Z"),withdrawn=false,creates=0;
 const licenses=new MemoryLicenseRepository();await licenses.save(createAnnualLicense("sender-a",now));
 const entitlements=new EntitlementService({async createCheckout(){throw new Error("UNEXPECTED");},async verifyPayment(){throw new Error("UNEXPECTED");}},licenses);
 const transfers=new TransferService(new MemoryStorage()),create=transfers.createDurable.bind(transfers);transfers.createDurable=async value=>{creates++;return create(value);};
 const sends=new SendAuthorizationService(entitlements,transfers),senderAccess=new SenderTransferAccessService("test-secret");
 const tools={} as Record<ConnectionCheck,ConnectionProbeTool>;
 for(const check of REQUIRED_CONNECTION_CHECKS)tools[check]={id:check,isCurrent:()=>!withdrawn,async run(){return {outcome:"passed",testReference:`synthetic:${check}`,...(check==="recipient-download"?{recipientNeedsInstallation:false}:{})};}};
 const coordinatorFor:NonNullable<SenderTransferRouterOptions["coordinatorFor"]>=async(customer,context)=>{
  assert.equal(context.networkAddress,"127.0.0.1");assert.ok(context.requestReference.startsWith("send-request:"));
  return new AutomaticConnectionCoordinator({async discover(){return {environment,observedAt:now.toISOString(),sourceReference:"synthetic"};}},{async toolsFor(){return tools;}},new GlobalConnectionReadinessAgent(),()=>now,10_000,undefined,customer.userId);
 };
 return {sends,senderAccess,coordinatorFor,clock:()=>now,entitlements,transfers,tools,licenses,advance(milliseconds:number){now=new Date(now.getTime()+milliseconds);},get creates(){return creates;},expire(){now=new Date(now.getTime()+5*60*1000);},withdraw(){withdrawn=true;}};
}
async function withServer(options:SenderTransferRouterOptions,run:(url:string)=>Promise<void>){
 const app=express();app.use(express.json());app.use("/v1/transfers",createSenderTransferRouter(options));const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));
 const address=server.address();if(!address||typeof address==="string")throw new Error("TEST_ADDRESS_REQUIRED");
 try{await run(`http://127.0.0.1:${address.port}/v1/transfers`);}finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}
const post=(url:string,body:unknown=input,token="sender-a",headers:Record<string,string>={})=>fetch(url,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json",...headers},body:JSON.stringify(body)});
test("transfer creation requires fresh server probes and keeps upload credentials intact",async()=>{
 const configured=await configuration();let probes=0;for(const tool of Object.values(configured.tools)){const run=tool.run.bind(tool);tool.run=async(...args)=>{probes++;return run(...args);};}
 await withServer({authenticator,...configured},async url=>{const reply=await post(url),result=await reply.json();assert.equal(reply.status,201);assert.equal(reply.headers.get("cache-control"),"no-store");assert.equal(probes,7);assert.equal(configured.creates,1);assert.equal(configured.senderAccess.verify(`Bearer ${result.uploadToken}`,result.id).transferId,result.id);assert.equal(result.uploadPartUrlTemplate,`/v1/transfers/${result.id}/parts/{partNumber}`);assert.equal("environment" in result,false);});
});
test("unconfigured or failed connection setup cannot create a transfer or expose private errors",async()=>{
 const configured=await configuration();for(const coordinatorFor of [undefined,async()=>{throw new Error("PRIVATE_SETUP_DETAIL");}])await withServer({authenticator,...configured,coordinatorFor},async url=>{const reply=await post(url);assert.equal(reply.status,503);assert.deepEqual(await reply.json(),{error:"SEND_CONNECTION_NOT_READY"});assert.equal(configured.creates,0);});
});
test("failed restricted and missing probes cannot create a transfer",async()=>{
 for(const outcome of ["failed","restricted","missing"]){const configured=await configuration();if(outcome==="missing")delete (configured.tools as Partial<typeof configured.tools>).upload;else configured.tools.upload.run=async()=>({outcome:outcome as "failed"|"restricted",testReference:"synthetic"});await withServer({authenticator,...configured},async url=>{assert.equal((await post(url)).status,503);assert.equal(configured.creates,0);});}
});
test("a browser readiness flag or body identity cannot bypass server discovery",async()=>{
 const configured=await configuration();let discovery=0;await withServer({authenticator,...configured,async coordinatorFor(...args){discovery++;return configured.coordinatorFor(...args);}},async url=>{
  for(const extra of [{ready:true},{userId:"sender-b"},{country:"NO"},{validation:{assessment:{status:"verified"}}}]){assert.equal((await post(url,{...input,...extra})).status,400);}
  assert.equal((await post(url,input,"invalid")).status,401);assert.equal(discovery,0);assert.equal(configured.creates,0);
 });
});
test("connection evidence expiry or withdrawal during licensing blocks durable creation",async()=>{
 for(const invalidate of ["expire","withdraw"] as const){const configured=await configuration();const requireActive=configured.entitlements.requireActive.bind(configured.entitlements);configured.entitlements.requireActive=async(...args)=>{const license=await requireActive(...args);configured[invalidate]();return license;};await withServer({authenticator,...configured},async url=>{const reply=await post(url);assert.equal(reply.status,503);assert.deepEqual(await reply.json(),{error:"SEND_CONNECTION_NOT_READY"});assert.equal(configured.creates,0);});}
});
test("scope mismatch and unlicensed accounts cannot create transfers",async()=>{
 const configured=await configuration();await withServer({authenticator,...configured,async coordinatorFor(_customer,context,signal){return configured.coordinatorFor({userId:"sender-b"},context,signal);}},async url=>{assert.equal((await post(url)).status,503);assert.equal(configured.creates,0);});
 await withServer({authenticator,...configured},async url=>{const reply=await post(url,input,"sender-b");assert.equal(reply.status,403);assert.deepEqual(await reply.json(),{error:"ACTIVE_LICENSE_REQUIRED",note:"Please renew your service."});assert.equal(configured.creates,0);});
});
test("creation refreshes owned fallback choices rather than trusting an old browser result",async()=>{
 const configured=await configuration(),fallback=new CustomerConnectionFallback({provider:[{id:"mail",label:"Mail",value:environment.provider}]},configured.clock);
 const known={...environment,provider:undefined};const form=fallback.prepare("sender-a",known,["provider"]);assert.ok(form);
 const coordinatorFor:NonNullable<SenderTransferRouterOptions["coordinatorFor"]>=async customer=>new AutomaticConnectionCoordinator({async discover(){return {environment:known,observedAt:configured.clock().toISOString(),sourceReference:"synthetic"};}},{async toolsFor(){return configured.tools;}},new GlobalConnectionReadinessAgent(),configured.clock,10_000,fallback,customer.userId);
 await withServer({authenticator,...configured,coordinatorFor},async url=>{
  assert.equal((await post(url)).status,503);assert.equal(configured.creates,0);
  const body={...input,connection:{formId:form.id,selections:{provider:"mail"}}};assert.equal((await post(url,body,"sender-b")).status,503);assert.equal(configured.creates,0);assert.equal((await post(url,body)).status,201);assert.equal(configured.creates,1);
 });
});
test("request deadline during licensing prevents late transfer creation",async()=>{
 const configured=await configuration();let entered!:()=>void,release!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;}),held=new Promise<void>(resolve=>{release=resolve;});const requireActive=configured.entitlements.requireActive.bind(configured.entitlements);configured.entitlements.requireActive=async(...args)=>{entered();await held;return requireActive(...args);};
 await withServer({authenticator,...configured,timeoutMs:50},async url=>{const pending=post(url);await started;const reply=await pending;assert.equal(reply.status,503);release();await new Promise(resolve=>setImmediate(resolve));assert.equal(configured.creates,0);});
});
test("late setup completion after timeout cannot run probes or create a transfer",async()=>{
 const configured=await configuration();let release!:()=>void,signal:AbortSignal|undefined,probes=0;const held=new Promise<void>(resolve=>{release=resolve;});configured.tools.upload.run=async()=>{probes++;return {outcome:"passed",testReference:"synthetic"};};
 await withServer({authenticator,...configured,timeoutMs:20,async coordinatorFor(...args){signal=args[2];await held;return configured.coordinatorFor(...args);}},async url=>{const reply=await post(url);assert.equal(reply.status,503);assert.equal(signal?.aborted,true);release();await new Promise(resolve=>setImmediate(resolve));assert.equal(probes,0);assert.equal(configured.creates,0);});
});
test("busy creation requests do not start duplicate checks and capacity releases after completion",async()=>{
 const configured=await configuration();let calls=0,entered!:()=>void,release!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;}),held=new Promise<void>(resolve=>{release=resolve;});
 await withServer({authenticator,...configured,async coordinatorFor(...args){calls++;if(calls===1){entered();await held;}return configured.coordinatorFor(...args);}},async url=>{
  const first=post(url);await started;try{assert.equal((await post(url)).status,503);assert.equal(calls,1);assert.equal(configured.creates,0);}finally{release();}assert.equal((await first).status,201);assert.equal((await post(url)).status,201);assert.equal(configured.creates,2);
 });
});
test("creation uses client software only as hints and rejects untrusted origins",async()=>{
 const configured=await configuration(),software={client:"test-client",platform:"android",softwareVersion:"1.0"};let calls=0;
 await withServer({authenticator,...configured,allowedOrigins:["https://app.example"],async coordinatorFor(customer,context,signal){calls++;assert.deepEqual(context.softwareHints,software);return configured.coordinatorFor(customer,context,signal);}},async url=>{
  assert.equal((await post(url,{...input,software},"sender-a",{origin:"https://other.example"})).status,403);assert.equal(calls,0);
  assert.equal((await post(url,{...input,software},"sender-a",{origin:"https://app.example"})).status,201);assert.equal(calls,1);
 });
});
test("configured check and transfer routes share owned fallback forms with fresh send validation",async()=>{
 const {createConfiguredConnectionRouters}=await import("../src/config/connection-check-router-factory.js"),configured=await configuration();let providerCalls=0;
 const observed=(details:object)=>({details,observedAt:configured.clock().toISOString(),sourceReference:"synthetic"});
 const routes=createConfiguredConnectionRouters({authenticator,sends:configured.sends,senderAccess:configured.senderAccess,observations:{clock:configured.clock,catalog:{async toolsFor(){return configured.tools;}},fallback:new CustomerConnectionFallback({provider:[{id:"mail",label:"Mail",value:environment.provider}]},configured.clock),async network(){return observed({country:environment.country,network:environment.network});},async provider(){providerCalls++;return observed({});}}});
 const app=express();app.use(express.json());app.use("/v1/connection",routes.checks);app.use("/v1/transfers",routes.transfers);const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));const address=server.address();if(!address||typeof address==="string")throw new Error("TEST_ADDRESS_REQUIRED");
 try{
  const base=`http://127.0.0.1:${address.port}`,software={client:environment.client,platform:environment.platform,softwareVersion:environment.softwareVersion};
  const first=await post(`${base}/v1/connection/check`,{software}),form=await first.json();assert.equal(first.status,200);assert.equal(form.status,"customer-input-required");
  const sent=await post(`${base}/v1/transfers`,{...input,software,connection:{formId:form.form.id,selections:{provider:"mail"}}});assert.equal(sent.status,201);assert.equal(providerCalls,2);assert.equal(configured.creates,1);
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
test("client disconnect during licensing cancels creation before any durable transfer is made",async()=>{
 const {request}=await import("node:http"),configured=await configuration();let entered!:()=>void,release!:()=>void,aborted!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;}),held=new Promise<void>(resolve=>{release=resolve;}),cancelled=new Promise<void>(resolve=>{aborted=resolve;});
 const requireActive=configured.entitlements.requireActive.bind(configured.entitlements);configured.entitlements.requireActive=async(...args)=>{entered();await held;return requireActive(...args);};
 await withServer({authenticator,...configured,async coordinatorFor(...args){args[2].addEventListener("abort",aborted,{once:true});return configured.coordinatorFor(...args);}},async url=>{
  const pending=request(url,{method:"POST",headers:{authorization:"Bearer sender-a","content-type":"application/json"}},()=>{});pending.on("error",()=>{});pending.end(JSON.stringify(input));await started;pending.destroy();await cancelled;release();await new Promise(resolve=>setImmediate(resolve));assert.equal(configured.creates,0);
 });
});
test("HTTP creation rechecks a live license clock after the repository wait",async()=>{
 const configured=await configuration(),license=await configured.licenses.getByUserId("sender-a");assert.ok(license);license.expiresAt=new Date(configured.clock().getTime()+1000);
 const read=configured.licenses.listByUserId.bind(configured.licenses);configured.licenses.listByUserId=async userId=>{const rows=await read(userId);configured.advance(1001);return rows;};
 await withServer({authenticator,...configured},async url=>{const reply=await post(url);assert.equal(reply.status,403);assert.deepEqual(await reply.json(),{error:"ACTIVE_LICENSE_REQUIRED",note:"Please renew your service."});assert.equal(configured.creates,0);});
});
