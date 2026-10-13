import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import express from "express";
import {createBillingRouter,type BillingRouterOptions,billingOriginsFromEnvironment} from "../src/http/billing-router.js";
import {EntitlementService} from "../src/billing/entitlement-service.js";
import {MemoryLicenseRepository} from "../src/adapters/memory-license-repository.js";
import {MemoryLicensePaymentApplicationRepository} from "../src/adapters/memory-license-payment-application-repository.js";
import type {CheckoutRequest} from "../src/billing/payment-provider.js";
const reference="stripe-checkout:cs_test_demo",confirmation={providerReference:reference},checkout={plan:"individual",requestId:randomUUID()};
async function fixture(){
 const licenses=new MemoryLicenseRepository(),ledger=new MemoryLicensePaymentApplicationRepository(licenses),calls:CheckoutRequest[]=[];
 const payments={async createCheckout(request:CheckoutRequest){calls.push(request);return {checkoutId:"cs_test_demo",providerReference:reference,checkoutUrl:"https://checkout.stripe.com/c/pay/cs_test_demo"};},async verifyPayment(providerReference:string){return {userId:"a",amountUsdCents:400,paidAt:new Date("2026-10-12T20:00:00Z"),providerReference,status:"paid" as const};}};
 const authenticator={async authenticate(value:string|undefined){if(value!=="Bearer a"&&value!=="Bearer b")throw new Error("PRIVATE_AUTH_DETAIL");return {userId:value.slice(7)};}};
 return {licenses,ledger,calls,payments,authenticator,entitlements:new EntitlementService(payments,licenses,ledger)};
}
async function server(options:BillingRouterOptions,run:(base:string)=>Promise<void>){
 const app=express();app.use(express.json());app.use("/v1/billing",createBillingRouter(options));const http=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>http.once("listening",resolve));const address=http.address();assert.ok(address&&typeof address!=="string");
 try{await run(`http://127.0.0.1:${address.port}/v1/billing`);}finally{await new Promise<void>((resolve,reject)=>http.close(error=>error?reject(error):resolve()));}
}
const post=(url:string,body:unknown,token="a",headers:Record<string,string>={})=>fetch(url,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json",...headers},body:JSON.stringify(body)});
test("checkout derives authenticated account and price from the selected plan",async()=>{
 const f=await fixture();await server(f,async base=>{
  const result=await post(`${base}/checkout`,checkout);assert.equal(result.status,201);assert.equal(result.headers.get("cache-control"),"no-store");assert.equal((await result.json()).providerReference,reference);
  assert.deepEqual(f.calls[0],{userId:"a",plan:"individual",product:"annual-license",amountUsdCents:400,requestId:checkout.requestId});
  assert.equal((await post(`${base}/checkout`,{...checkout,plan:"business"})).status,201);assert.equal(f.calls[1].amountUsdCents,1000);
 });
});
test("missing invalid and body-supplied identities paid flags and prices cannot reach checkout",async()=>{
 const f=await fixture();await server(f,async base=>{
  assert.equal((await fetch(`${base}/checkout`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(checkout)})).status,401);
  assert.equal((await post(`${base}/checkout`,checkout,"wrong")).status,401);
  for(const extra of [{userId:"b"},{amountUsdCents:1},{paid:true},{requestId:"bad"},{plan:"other"}])assert.equal((await post(`${base}/checkout`,{...checkout,...extra})).status,400);
  assert.equal(f.calls.length,0);
 });
});
test("payment confirmation is customer-bound and repeated confirmation returns one term",async()=>{
 const f=await fixture();await server(f,async base=>{
  const rejected=await post(`${base}/confirm-payment`,confirmation,"b");assert.equal(rejected.status,409);assert.deepEqual(await rejected.json(),{error:"PAYMENT_CONFIRMATION_REJECTED"});assert.equal(await f.licenses.getByUserId("a"),null);
  const first=await post(`${base}/confirm-payment`,confirmation);assert.equal(first.status,200);const license=await first.json();assert.equal(license.plan,"individual");assert.equal("userId" in license,false);
  const replay=await post(`${base}/confirm-payment`,confirmation);assert.equal(replay.status,200);assert.deepEqual(await replay.json(),license);
 });
});
test("failed refunded and mismatched provider evidence never changes a license",async()=>{
 for(const value of [{status:"failed"},{status:"refunded"},{providerReference:"other"},{amountUsdCents:1}]){
  const f=await fixture(),verify=f.payments.verifyPayment;f.payments.verifyPayment=async ref=>({...await verify(ref),...value} as any);
  await server(f,async base=>{assert.equal((await post(`${base}/confirm-payment`,confirmation)).status,409);assert.equal(await f.licenses.getByUserId("a"),null);});
 }
});
test("origin content-type and strict confirmation validation fail before provider use",async()=>{
 const f=await fixture();await server({...f,allowedOrigins:["https://app.example"]},async base=>{
  assert.equal((await post(`${base}/checkout`,checkout,"a",{origin:"https://evil.example"})).status,403);
  assert.equal((await post(`${base}/checkout`,checkout,"a",{"content-type":"text/plain"})).status,415);
  for(const extra of [{userId:"a"},{ready:true},{providerReference:"../../keys"}])assert.equal((await post(`${base}/confirm-payment`,{...confirmation,...extra})).status,400);
  assert.equal((await post(`${base}/checkout`,checkout,"a",{origin:"https://app.example"})).status,201);assert.equal(f.calls.length,1);
 });
 assert.deepEqual(billingOriginsFromEnvironment({BILLING_ALLOWED_ORIGINS:"https://one.example, https://two.example"}),["https://one.example","https://two.example"]);
 assert.throws(()=>createBillingRouter({...f,allowedOrigins:["http://app.example"]}),/INVALID_BILLING_ORIGIN/);
});
test("timeout during payment verification prevents a late license application",async()=>{
 const f=await fixture();let entered!:()=>void,release!:()=>void;const started=new Promise<void>(done=>{entered=done;}),held=new Promise<void>(done=>{release=done;}),verify=f.payments.verifyPayment;
 f.payments.verifyPayment=async ref=>{entered();await held;return verify(ref);};
 await server({...f,timeoutMs:50},async base=>{const pending=post(`${base}/confirm-payment`,confirmation);await started;assert.equal((await pending).status,503);release();await new Promise(done=>setImmediate(done));assert.equal(await f.licenses.getByUserId("a"),null);});
});
test("client disconnect during verification prevents a late license application",async()=>{
 const {request}=await import("node:http"),f=await fixture();let entered!:()=>void,release!:()=>void,aborted!:()=>void;
 const started=new Promise<void>(done=>{entered=done;}),held=new Promise<void>(done=>{release=done;}),cancelled=new Promise<void>(done=>{aborted=done;}),verify=f.payments.verifyPayment;
 f.payments.verifyPayment=async ref=>{entered();await held;return verify(ref);};
 await server({...f,authenticator:{async authenticate(...args){args[1]?.addEventListener("abort",aborted,{once:true});return f.authenticator.authenticate(args[0]);}}},async base=>{
  const pending=request(`${base}/confirm-payment`,{method:"POST",headers:{authorization:"Bearer a","content-type":"application/json"}},()=>{});pending.on("error",()=>{});pending.end(JSON.stringify(confirmation));await started;pending.destroy();await cancelled;release();await new Promise(done=>setImmediate(done));assert.equal(await f.licenses.getByUserId("a"),null);
 });
});
test("billing capacity blocks overlap and releases slots after checkout failure",async()=>{
 const f=await fixture();let entered!:()=>void,release!:()=>void;const started=new Promise<void>(done=>{entered=done;}),held=new Promise<void>(done=>{release=done;});let calls=0;
 f.payments.createCheckout=async()=>{calls++;if(calls===1){entered();await held;throw new Error("PRIVATE_PROVIDER_DETAIL");}return {checkoutId:"cs_test_demo",providerReference:reference,checkoutUrl:"https://checkout.stripe.com/c/pay/cs_test_demo"};};
 await server({...f,concurrency:{perCustomer:1,total:1}},async base=>{
  const pending=post(`${base}/checkout`,checkout);await started;
  for(const token of ["a","b"]){const response=await post(`${base}/checkout`,checkout,token);assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:"BILLING_BUSY"});}
  release();const failed=await pending;assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{error:"BILLING_UNAVAILABLE"});assert.equal((await post(`${base}/checkout`,checkout)).status,201);
 });
});
for(const kind of ["checkout","confirm-payment"] as const)for(const lateFailure of [false,true])test(`${kind} timeout retains global and customer admission until late ${lateFailure?"failure":"success"}`,async()=>{
 const f=await fixture();let entered!:()=>void,release!:()=>void,calls=0;
 const started=new Promise<void>(done=>{entered=done;}),held=new Promise<void>(done=>{release=done;});
 const hold=async()=>{if(++calls===1){entered();await held;if(lateFailure)throw new Error("PRIVATE_LATE_FAILURE");}};
 const create=f.payments.createCheckout,verify=f.payments.verifyPayment;
 if(kind==="checkout")f.payments.createCheckout=async input=>{await hold();return create(input);};
 else f.payments.verifyPayment=async ref=>{await hold();return verify(ref);};
 await server({...f,timeoutMs:100,concurrency:{perCustomer:1,total:1}},async base=>{
  const body=kind==="checkout"?checkout:confirmation,pending=post(`${base}/${kind}`,body);await started;assert.equal((await pending).status,503);
  try{for(const token of ["a","b"]){const blocked=await post(`${base}/${kind}`,body,token);assert.equal(blocked.status,503);assert.deepEqual(await blocked.json(),{error:"BILLING_BUSY"});}assert.equal(calls,1);}finally{release();}
  await new Promise(done=>setImmediate(done));assert.equal(await f.licenses.getByUserId("a"),null);
  assert.equal((await post(`${base}/${kind}`,body)).status,kind==="checkout"?201:200);assert.equal(calls,2);
 });
});
test("disconnected checkout retains the customer's slot while other customers may proceed",async()=>{
 const {request}=await import("node:http"),f=await fixture();let entered!:()=>void,release!:()=>void,aborted!:()=>void,calls=0;
 const started=new Promise<void>(done=>{entered=done;}),held=new Promise<void>(done=>{release=done;}),cancelled=new Promise<void>(done=>{aborted=done;}),create=f.payments.createCheckout;
 f.payments.createCheckout=async input=>{if(++calls===1){entered();await held;}return create(input);};
 await server({...f,concurrency:{perCustomer:1,total:2},authenticator:{async authenticate(...args){args[1]?.addEventListener("abort",aborted,{once:true});return f.authenticator.authenticate(args[0]);}}},async base=>{
  const pending=request(`${base}/checkout`,{method:"POST",headers:{authorization:"Bearer a","content-type":"application/json"}},()=>{});pending.on("error",()=>{});pending.end(JSON.stringify(checkout));await started;pending.destroy();await cancelled;
  try{const blocked=await post(`${base}/checkout`,checkout);assert.equal(blocked.status,503);assert.deepEqual(await blocked.json(),{error:"BILLING_BUSY"});assert.equal((await post(`${base}/checkout`,checkout,"b")).status,201);assert.equal(calls,2);}finally{release();}
  await new Promise(done=>setImmediate(done));assert.equal((await post(`${base}/checkout`,checkout)).status,201);assert.equal(calls,3);
 });
});
