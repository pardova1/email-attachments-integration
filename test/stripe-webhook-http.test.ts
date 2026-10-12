import assert from "node:assert/strict";
import test from "node:test";
import {createHmac} from "node:crypto";
import express from "express";
import {createStripeWebhookRouter,configuredStripeWebhookOptions,type StripeWebhookOptions} from "../src/http/stripe-webhook-router.js";
import {verifyStripeWebhookSignature} from "../src/security/stripe-webhook-signature.js";
import {EntitlementService} from "../src/billing/entitlement-service.js";
import {MemoryLicenseRepository} from "../src/adapters/memory-license-repository.js";
import {MemoryLicensePaymentApplicationRepository} from "../src/adapters/memory-license-payment-application-repository.js";
const secret="whsec_synthetic",now=Date.parse("2026-10-12T23:06:00Z"),timestamp=Math.floor(now/1000),reference="stripe-checkout:cs_test_demo";
const event=()=>({id:"evt_demo",object:"event",type:"checkout.session.completed",livemode:false,data:{object:{id:"cs_test_demo",object:"checkout.session",livemode:false,metadata:{bridge_product:"email-bridge-license-v1",user_id:"a",plan:"individual"},payment_status:"paid",amount_total:400}}});
const signed=(body:string,t=timestamp,key=secret)=>`t=${t},v1=${createHmac("sha256",key).update(`${t}.`).update(body).digest("hex")}`;
async function fixture(){const licenses=new MemoryLicenseRepository(),ledger=new MemoryLicensePaymentApplicationRepository(licenses);let calls=0;
 const payments={async createCheckout(){throw new Error("UNUSED");},async verifyPayment(providerReference:string){calls++;return {userId:"a",providerReference,amountUsdCents:400,paidAt:new Date(now),status:"paid" as const};}};
 return {licenses,ledger,payments,entitlements:new EntitlementService(payments,licenses,ledger),get calls(){return calls;}};
}
async function server(options:StripeWebhookOptions,run:(url:string)=>Promise<void>){const app=express();app.use("/hook",createStripeWebhookRouter(options));app.use(express.json());const http=app.listen(0,"127.0.0.1");await new Promise<void>(done=>http.once("listening",done));const address=http.address();assert.ok(address&&typeof address!=="string");try{await run(`http://127.0.0.1:${address.port}/hook`);}finally{await new Promise<void>((resolve,reject)=>http.close(error=>error?reject(error):resolve()));}}
const post=(url:string,body:string=JSON.stringify(event()),header:string=signed(body),headers:Record<string,string>={})=>fetch(url,{method:"POST",headers:{"content-type":"application/json","stripe-signature":header,...headers},body});
const configured=(f:Awaited<ReturnType<typeof fixture>>)=>({entitlements:f.entitlements,secret,expectedLiveMode:false,clock:()=>now});
test("raw-byte signatures reject tampering stale future wrong-secret and downgraded headers",()=>{
 const body=JSON.stringify(event());verifyStripeWebhookSignature(Buffer.from(body),signed(body),secret,now);
 const digest=signed(body).split("v1=")[1];verifyStripeWebhookSignature(Buffer.from(body),`t=${timestamp},v1=${"0".repeat(64)},v1=${digest},v0=ignored`,secret,now);
 for(const header of [signed(body,timestamp-301),signed(body,timestamp+301),signed(body,timestamp,"whsec_wrong"),`t=${timestamp},v0=${digest}`,`t=${timestamp},t=${timestamp},v1=${digest}`,undefined])assert.throws(()=>verifyStripeWebhookSignature(Buffer.from(body),header,secret,now),/REJECTED/);
 assert.throws(()=>verifyStripeWebhookSignature(Buffer.from(body+" "),signed(body),secret,now),/REJECTED/);
});
test("verified webhook applies once across duplicate deliveries and customer confirmation",async()=>{
 const f=await fixture();await server(configured(f),async url=>{
  const first=await post(url);assert.equal(first.status,200);assert.deepEqual(await first.json(),{received:true,handled:true});assert.equal(first.headers.get("cache-control"),"no-store");
  const a=await f.licenses.getByUserId("a");assert.ok(a);
  const changed={...event(),id:"evt_other",type:"checkout.session.async_payment_succeeded"};assert.equal((await post(url,JSON.stringify(changed))).status,200);
  const manual=await f.entitlements.activateFromPayment(reference,undefined,{expectedUserId:"a",beforeApply(){}});assert.equal(manual.expiresAt.getTime(),a.expiresAt.getTime());assert.equal(f.calls,3);
 });
});
test("invalid signatures wrong modes malformed and oversized bodies do not call provider",async()=>{
 const f=await fixture();await server(configured(f),async url=>{
  assert.equal((await post(url,JSON.stringify(event()),"bad")).status,400);
  const wrong={...event(),livemode:true};assert.equal((await post(url,JSON.stringify(wrong))).status,400);
  assert.equal((await post(url,"{")).status,400);
  const malformed={...event(),data:{object:{...event().data.object,id:"../../keys"}}};assert.equal((await post(url,JSON.stringify(malformed))).status,400);
  assert.equal((await post(url,"x".repeat(256*1024+1))).status,413);
  assert.equal((await post(url,JSON.stringify(event()),undefined,{"content-type":"text/plain"})).status,400);assert.equal(f.calls,0);
 });
});
test("unsupported account event and unrelated products are acknowledged without application",async()=>{
 const f=await fixture();await server(configured(f),async url=>{
  for(const body of [{...event(),type:"charge.refunded"},{...event(),account:"acct_other"},{...event(),data:{object:{...event().data.object,metadata:{bridge_product:"other"}}}}]){const response=await post(url,JSON.stringify(body));assert.equal(response.status,200);assert.deepEqual(await response.json(),{received:true,handled:false});}
  assert.equal(f.calls,0);
 });
});
test("event-supplied paid flags do not replace provider evidence or customer binding",async()=>{
 for(const changed of [{userId:"b"},{status:"failed"},{status:"refunded"},{providerReference:"other"},{amountUsdCents:1}]){const f=await fixture(),verify=f.payments.verifyPayment;f.payments.verifyPayment=async ref=>({...await verify(ref),...changed} as any);
  await server(configured(f),async url=>{const response=await post(url);assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:"STRIPE_WEBHOOK_UNAVAILABLE"});assert.equal(await f.licenses.getByUserId("a"),null);assert.equal(await f.licenses.getByUserId("b"),null);});
 }
});
test("deadline prevents late verification from applying a license and releases admission",async()=>{
 const f=await fixture();let entered!:()=>void,release!:()=>void;const started=new Promise<void>(done=>{entered=done;}),held=new Promise<void>(done=>{release=done;}),verify=f.payments.verifyPayment;let calls=0;
 f.payments.verifyPayment=async ref=>{if(++calls===1){entered();await held;}return verify(ref);};
 await server({...configured(f),timeoutMs:50},async url=>{const pending=post(url);await started;assert.equal((await pending).status,503);release();await new Promise(done=>setImmediate(done));assert.equal(await f.licenses.getByUserId("a"),null);assert.equal((await post(url)).status,200);});
});
test("busy overlapping delivery is retried while one successful application completes",async()=>{
 const f=await fixture();let entered!:()=>void,release!:()=>void;const started=new Promise<void>(done=>{entered=done;}),held=new Promise<void>(done=>{release=done;}),verify=f.payments.verifyPayment;let calls=0;
 f.payments.verifyPayment=async ref=>{if(++calls===1){entered();await held;}return verify(ref);};
 await server({...configured(f),concurrency:{perCustomer:1,total:1}},async url=>{const pending=post(url);await started;const busy=await post(url);assert.equal(busy.status,503);assert.deepEqual(await busy.json(),{error:"STRIPE_WEBHOOK_BUSY"});release();assert.equal((await pending).status,200);assert.equal((await post(url)).status,200);assert.equal(calls,2);});
});
test("configuration stays unavailable without secret and rejects unsafe partial configuration",async()=>{
 const f=await fixture();await server({entitlements:f.entitlements},async url=>{assert.equal((await post(url)).status,503);assert.equal(f.calls,0);});
 assert.deepEqual(configuredStripeWebhookOptions(f.entitlements,{}),{entitlements:f.entitlements});
 assert.throws(()=>configuredStripeWebhookOptions(f.entitlements,{STRIPE_WEBHOOK_SECRET:secret}),/NOT_CONFIGURED/);
 assert.throws(()=>createStripeWebhookRouter({...configured(f),secret:""}),/NOT_CONFIGURED/);
 const env={PAYMENT_PROVIDER:"stripe",STRIPE_SECRET_KEY:"sk_live_synthetic",STRIPE_WEBHOOK_SECRET:secret,NODE_ENV:"production"};assert.equal(configuredStripeWebhookOptions(f.entitlements,env).expectedLiveMode,true);
 assert.throws(()=>configuredStripeWebhookOptions(f.entitlements,{...env,STRIPE_SECRET_KEY:"sk_test_synthetic"}),/NOT_CONFIGURED/);
});
