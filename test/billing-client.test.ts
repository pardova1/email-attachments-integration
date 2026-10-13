import assert from "node:assert/strict";
import test from "node:test";
import {BillingClient,BillingClientError} from "../src/client/billing-client.js";
const api="https://app.example/v1/billing",requestId="11111111-1111-4111-8111-111111111111";
const checkout={checkoutId:"cs_test_demo",providerReference:"stripe-checkout:cs_test_demo",checkoutUrl:"https://checkout.stripe.com/c/pay/demo"};
const license={plan:"individual",startsAt:"2026-10-13T00:00:00.000Z",expiresAt:"2027-10-13T00:00:00.000Z",amountPaidUsdCents:400,status:"active"};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});
const error=(code:string)=>(value:unknown)=>value instanceof BillingClientError&&value.code===code;
test("billing client sends current authentication and only server-approved input",async()=>{
 let tokens=0;const sent:any[]=[];
 const client=new BillingClient(api,async()=>`token${++tokens}`,async(url,init)=>{sent.push({url,body:JSON.parse(String(init!.body))});assert.equal((init!.headers as any).authorization,`Bearer token${tokens}`);assert.equal(init!.credentials,"omit");assert.equal(init!.redirect,"error");assert.equal(init!.cache,"no-store");return String(url).endsWith("checkout")?json(checkout,201):json(license);});
 assert.deepEqual(await client.checkout({plan:"individual",requestId}),checkout);assert.deepEqual(await client.confirm(checkout.providerReference),license);
 assert.deepEqual(sent,[{url:api+"/checkout",body:{plan:"individual",requestId}},{url:api+"/confirm-payment",body:{providerReference:checkout.providerReference}}]);assert.equal(tokens,2);
 await assert.rejects(client.checkout({plan:"individual",requestId,userId:"another"} as any),error("REQUEST_REJECTED"));await assert.rejects(client.confirm("../../keys"),error("REQUEST_REJECTED"));assert.equal(tokens,2);
});
test("billing rejects unsafe endpoint configuration",()=>{
 for(const value of ["http://app.example/v1/billing","https://user:pass@app.example/v1/billing",api+"?token=x",api+"#x","https://app.example/elsewhere"])assert.throws(()=>new BillingClient(value,async()=>"token"),/INVALID_BILLING_CLIENT_CONFIGURATION/);
});
test("checkout never exposes unsafe navigation or mismatched payment references",async()=>{
 for(const value of [{...checkout,checkoutUrl:"https://evil.example/pay"},{...checkout,checkoutUrl:"https://checkout.stripe.com.evil.example"},{...checkout,checkoutUrl:"https://user@checkout.stripe.com/pay"},{...checkout,checkoutUrl:"javascript:alert(1)"},{...checkout,providerReference:"stripe-checkout:cs_test_other"},{...checkout,paid:true}]){
  const client=new BillingClient(api,async()=>"token",async()=>json(value,201));await assert.rejects(client.checkout({plan:"individual",requestId}),error("INVALID_RESPONSE"));
 }
});
test("confirmation rejects private extras inconsistent plan amounts and invalid intervals",async()=>{
 for(const value of [{...license,userId:"secret"},{...license,amountPaidUsdCents:1000},{...license,expiresAt:license.startsAt},{...license,startsAt:"invalid"},{...license,plan:"other"}]){const client=new BillingClient(api,async()=>"token",async()=>json(value));await assert.rejects(client.confirm(checkout.providerReference),error("INVALID_RESPONSE"));}
});
test("billing status mapping never exposes private server details",async()=>{
 for(const [status,body,code] of [[401,{error:"PRIVATE_TOKEN"},"AUTHENTICATION_REQUIRED"],[403,{error:"PRIVATE_ORIGIN"},"REQUEST_REJECTED"],[409,{error:"PRIVATE_CUSTOMER"},"PAYMENT_REJECTED"],[503,{error:"BILLING_BUSY"},"BILLING_BUSY"],[503,{error:"PRIVATE_KEY"},"BILLING_UNAVAILABLE"],[500,{error:"PRIVATE_EXCEPTION"},"BILLING_UNAVAILABLE"]] as const){const client=new BillingClient(api,async()=>"token",async()=>json(body,status));await assert.rejects(client.confirm(checkout.providerReference),error(code));}
});
test("billing bounds token transport and body waits with a single deadline",async()=>{
 for(const stage of ["token","transport","body"]){const client=new BillingClient(api,async()=>stage==="token"?new Promise(()=>{}):"token",async()=>stage==="transport"?new Promise(()=>{}):new Response(new ReadableStream({start(){}}),{headers:{"content-type":"application/json"}}),20);await assert.rejects(client.confirm(checkout.providerReference),error("BILLING_UNAVAILABLE"));}
});
test("billing abort prevents late token from starting a request",async()=>{
 let release!:(token:string)=>void,calls=0;const held=new Promise<string>(done=>{release=done;}),controller=new AbortController(),client=new BillingClient(api,async()=>held,async()=>{calls++;return json(license);});
 const pending=client.confirm(checkout.providerReference,controller.signal);controller.abort();await assert.rejects(pending,{name:"AbortError"});release("private-token");await new Promise(done=>setImmediate(done));assert.equal(calls,0);
});
test("late ignored transport response is cancelled and oversized or invalid bodies fail",async()=>{
 let release!:(response:Response)=>void,cancelled=0;const held=new Promise<Response>(done=>{release=done;}),client=new BillingClient(api,async()=>"token",async()=>held,20);
 await assert.rejects(client.confirm(checkout.providerReference),error("BILLING_UNAVAILABLE"));release(new Response(new ReadableStream({cancel(){cancelled++;}})));await new Promise(done=>setImmediate(done));assert.equal(cancelled,1);
 for(const response of [json({value:"x".repeat(17000)}),new Response("{",{headers:{"content-type":"application/json"}}),new Response("{}",{headers:{"content-type":"text/html"}}),new Response(new Uint8Array([255]),{headers:{"content-type":"application/json"}})]){const client=new BillingClient(api,async()=>"token",async()=>response);await assert.rejects(client.confirm(checkout.providerReference),error("INVALID_RESPONSE"));}
});
test("browser billing client completes authenticated HTTP checkout and replay-safe confirmation",async()=>{
 const [{default:express},{createBillingRouter},{EntitlementService},{MemoryLicenseRepository},{MemoryLicensePaymentApplicationRepository}]=await Promise.all([import("express"),import("../src/http/billing-router.js"),import("../src/billing/entitlement-service.js"),import("../src/adapters/memory-license-repository.js"),import("../src/adapters/memory-license-payment-application-repository.js")]);
 const licenses=new MemoryLicenseRepository(),ledger=new MemoryLicensePaymentApplicationRepository(licenses),paidAt=new Date();let checkouts=0;
 const payments={async createCheckout(input:any){checkouts++;assert.equal(input.userId,"a");assert.equal(input.amountUsdCents,400);return checkout;},async verifyPayment(providerReference:string){return {userId:"a",providerReference,amountUsdCents:400,paidAt,status:"paid" as const};}};
 const app=express();app.use(express.json());app.use("/v1/billing",createBillingRouter({payments,entitlements:new EntitlementService(payments,licenses,ledger),authenticator:{async authenticate(authorization){assert.equal(authorization,"Bearer token");return {userId:"a"};}}}));
 const http=app.listen(0,"127.0.0.1");await new Promise<void>(done=>http.once("listening",done));const address=http.address();assert.ok(address&&typeof address!=="string");
 try{const client=new BillingClient(api,async()=>"token",(url,init)=>fetch(`http://127.0.0.1:${address.port}${new URL(String(url)).pathname}`,init));const created=await client.checkout({plan:"individual",requestId});assert.equal(checkouts,1);const first=await client.confirm(created.providerReference),replay=await client.confirm(created.providerReference);assert.deepEqual(replay,first);const status=await client.licenseStatus();assert.equal(status.licenses[0].active,true);assert.equal(status.licenses[0].expiresAt,first.expiresAt);assert.equal((await licenses.getByUserId("a"))?.expiresAt.toISOString(),first.expiresAt);}finally{await new Promise<void>((resolve,reject)=>http.close(error=>error?reject(error):resolve()));}
});
test("license status validates checked time plan identity and active interval without checkout",async()=>{
 const checkedAt=new Date().toISOString(),startsAt=new Date(Date.now()-86400000).toISOString(),expiresAt=new Date(Date.now()+86400000).toISOString(),item={...license,startsAt,expiresAt,active:true};let calls=0;
 const client=new BillingClient(api,async()=>"token",async(url,init)=>{calls++;assert.equal(url,api+"/license-status");assert.equal(init!.body,"{}");return json({checkedAt,licenses:[item]});});assert.equal((await client.licenseStatus()).licenses[0].active,true);assert.equal(calls,1);
 for(const value of [{checkedAt,licenses:[item,item]},{checkedAt,licenses:[{...item,active:false}]},{checkedAt,licenses:[{...item,userId:"private"}]},{checkedAt,licenses:[{...item,amountPaidUsdCents:1}]},{checkedAt:new Date(Date.now()-3600000).toISOString(),licenses:[]},{checkedAt:new Date(Date.now()+3600000).toISOString(),licenses:[]}]){const client=new BillingClient(api,async()=>"token",async()=>json(value));await assert.rejects(client.licenseStatus(),error("INVALID_RESPONSE"));}
});
