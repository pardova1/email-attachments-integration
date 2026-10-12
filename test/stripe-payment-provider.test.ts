import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {StripePaymentProvider,STRIPE_API_VERSION} from "../src/adapters/stripe-payment-provider.js";
import {createPaymentProvider} from "../src/config/payment-provider-factory.js";
import {EntitlementService} from "../src/billing/entitlement-service.js";
import {RenewalService} from "../src/billing/renewal-service.js";
import {MemoryLicenseRepository} from "../src/adapters/memory-license-repository.js";
import {MemoryLicensePaymentApplicationRepository} from "../src/adapters/memory-license-payment-application-repository.js";
const config={secretKey:"sk_test_synthetic",successUrl:"https://app.example/payment/success",cancelUrl:"https://app.example/payment/cancel"};
const reference="stripe-checkout:cs_test_demo",scope={userId:"user-a",amountUsdCents:400 as const,product:"annual-license" as const,requestId:randomUUID()};
const metadata={bridge_product:"email-bridge-license-v1",user_id:"user-a",plan:"individual"};
function paid(){return {id:"cs_test_demo",object:"checkout.session",mode:"payment",currency:"usd",amount_total:400,livemode:false,client_reference_id:"user-a",metadata:{...metadata},status:"complete",payment_status:"paid",payment_intent:{id:"pi_demo",object:"payment_intent",livemode:false,currency:"usd",amount:400,amount_received:400,status:"succeeded",metadata:{...metadata},latest_charge:{id:"ch_demo",object:"charge",payment_intent:"pi_demo",livemode:false,currency:"usd",amount:400,paid:true,captured:true,status:"succeeded",refunded:false,amount_refunded:0,disputed:false,created:Math.floor(Date.now()/1000)-60}}};}
const open=(input=paid())=>({...input,status:"open",payment_status:"unpaid",payment_intent:null,url:"https://checkout.stripe.com/c/pay/cs_test_demo"});
test("checkout uses validated prices identity and repeatable request-scoped idempotency",async()=>{
 const calls:Array<{body:URLSearchParams;key:string}>=[];
 const request:typeof fetch=async(url,options)=>{
  assert.equal(String(url),"https://api.stripe.com/v1/checkout/sessions");assert.equal(options?.method,"POST");assert.equal(options?.redirect,"error");assert.equal(options?.credentials,"omit");
  const headers=new Headers(options?.headers);assert.equal(headers.get("stripe-version"),STRIPE_API_VERSION);assert.equal(headers.get("authorization"),`Bearer ${config.secretKey}`);
  calls.push({body:new URLSearchParams(String(options?.body)),key:headers.get("idempotency-key")!});return Response.json(open());
 };
 const provider=new StripePaymentProvider(config,request),a=await provider.createCheckout(scope),b=await provider.createCheckout(scope);
 assert.equal(a.providerReference,reference);assert.equal(a.checkoutUrl,"https://checkout.stripe.com/c/pay/cs_test_demo");assert.deepEqual(a,b);assert.equal(calls[0].key,calls[1].key);
 assert.equal(calls[0].body.get("line_items[0][price_data][unit_amount]"),"400");assert.equal(calls[0].body.get("payment_intent_data[metadata][user_id]"),scope.userId);
 assert.equal(calls[0].body.get("locale"),"auto");assert.equal(calls[0].body.get("mode"),"payment");
 await provider.createCheckout({...scope,requestId:randomUUID()});assert.notEqual(calls[0].key,calls[2].key);
});
test("business checkout preserves its existing price and metadata",async()=>{
 const provider=new StripePaymentProvider(config,async(_url,options)=>{const body=new URLSearchParams(String(options?.body));assert.equal(body.get("line_items[0][price_data][unit_amount]"),"1000");assert.equal(body.get("metadata[plan]"),"business");return Response.json({...open(),amount_total:1000,metadata:{...metadata,plan:"business"}});});
 await provider.createCheckout({...scope,plan:"business",amountUsdCents:1000});
});
test("invalid checkout parameters are rejected before any provider call",async()=>{
 let calls=0;const provider=new StripePaymentProvider(config,async()=>{calls++;throw new Error("UNEXPECTED");});
 for(const change of [{requestId:undefined},{requestId:"invalid"},{plan:"business"},{userId:"other\nuser"},{amountUsdCents:1},{product:"other"}])await assert.rejects(provider.createCheckout({...scope,...change} as any),/INVALID_CHECKOUT_REQUEST/);
 assert.equal(calls,0);
});
test("verification fetches expanded Stripe evidence and activates once through shared ledger",async()=>{
 const response=paid(),provider=new StripePaymentProvider(config,async(url,options)=>{const u=new URL(String(url));assert.equal(u.origin,"https://api.stripe.com");assert.equal(u.pathname,"/v1/checkout/sessions/cs_test_demo");assert.equal(u.searchParams.get("expand[]"),"payment_intent.latest_charge");assert.equal(options?.method,"GET");return Response.json(response);});
 const payment=await provider.verifyPayment(reference);assert.equal(payment.status,"paid");assert.equal(payment.paidAt.getTime(),response.payment_intent.latest_charge.created*1000);
 const licenses=new MemoryLicenseRepository(),ledger=new MemoryLicensePaymentApplicationRepository(licenses),entitlements=new EntitlementService(provider,licenses,ledger);
 const a=await entitlements.activateFromPayment(reference),b=await new RenewalService(provider,licenses,ledger).renew(reference);assert.equal(a.expiresAt.getTime(),b.expiresAt.getTime());
});
test("unpaid malformed mismatched disputed and uncaptured evidence cannot authorize a license",async()=>{
 const changes:Array<(s:ReturnType<typeof paid>)=>void>=[s=>{s.id="cs_test_other";},s=>{s.currency="eur";},s=>{s.amount_total=1;},s=>{s.client_reference_id="other";},s=>{s.metadata.bridge_product="other";},s=>{s.metadata.plan="business";},s=>{s.livemode=true;},s=>{s.status="open";},s=>{s.payment_status="unpaid";},s=>{s.payment_intent.status="processing";},s=>{s.payment_intent.amount_received=0;},s=>{s.payment_intent.metadata.user_id="other";},s=>{s.payment_intent.latest_charge.payment_intent="pi_other";},s=>{s.payment_intent.latest_charge.disputed=true;},s=>{s.payment_intent.latest_charge.captured=false;},s=>{s.payment_intent.latest_charge.created=Math.floor(Date.now()/1000)+3600;}];
 for(const change of changes){const s=paid();change(s);await assert.rejects(new StripePaymentProvider(config,async()=>Response.json(s)).verifyPayment(reference),/PAYMENT_NOT_COMPLETED/);}
});
test("full and partial refunds remain ineligible for activation",async()=>{
 for(const refunded of [false,true]){const s=paid();s.payment_intent.latest_charge.refunded=refunded;s.payment_intent.latest_charge.amount_refunded=1;
  const provider=new StripePaymentProvider(config,async()=>Response.json(s));assert.equal((await provider.verifyPayment(reference)).status,"refunded");await assert.rejects(new EntitlementService(provider,new MemoryLicenseRepository()).activateFromPayment(reference),/PAYMENT_NOT_COMPLETED/);
 }
});
test("checkout URLs and provider references cannot redirect callers or access arbitrary API paths",async()=>{
 let calls=0;const provider=new StripePaymentProvider(config,async()=>{calls++;return Response.json(open());});
 for(const reference of ["cs_test_demo","stripe-checkout:../../keys","stripe-checkout:cs_test_demo?expand=secret"])await assert.rejects(provider.verifyPayment(reference),/INVALID_PAYMENT_REFERENCE/);assert.equal(calls,0);
 for(const url of ["https://evil.example/pay","https://user:secret@checkout.stripe.com/pay","http://checkout.stripe.com/pay"])await assert.rejects(new StripePaymentProvider(config,async()=>Response.json({...open(),url})).createCheckout(scope),/PAYMENT_PROVIDER_RESPONSE_INVALID/);
});
test("configured production provider requires live key HTTPS URLs and valid timeout",()=>{
 const env={NODE_ENV:"production",PAYMENT_PROVIDER:"stripe",STRIPE_SECRET_KEY:"sk_live_synthetic",PAYMENT_SUCCESS_URL:config.successUrl,PAYMENT_CANCEL_URL:config.cancelUrl};assert.ok(createPaymentProvider(env) instanceof StripePaymentProvider);
 for(const change of [{STRIPE_SECRET_KEY:config.secretKey},{PAYMENT_SUCCESS_URL:"http://app.example"},{PAYMENT_PROVIDER:"unknown"},{PAYMENT_PROVIDER_TIMEOUT_MS:"0"},{PAYMENT_PROVIDER_TIMEOUT_MS:"1e3"},{STRIPE_SECRET_KEY:""}])assert.throws(()=>createPaymentProvider({...env,...change}));
});
test("provider errors redirects malformed and oversized bodies do not leak private details",async()=>{
 for(const response of [()=>Response.json({error:{message:"PRIVATE_SECRET"}},{status:401}),()=>new Response("PRIVATE_HTML"),()=>new Response("{",{headers:{"content-type":"application/json"}}),()=>Response.json({value:"x".repeat(129*1024)}),()=>{const r=Response.json(paid());Object.defineProperty(r,"redirected",{value:true});return r;}])await assert.rejects(new StripePaymentProvider(config,async()=>response()).verifyPayment(reference),{message:"PAYMENT_PROVIDER_UNAVAILABLE"});
});
test("deadline bounds ignored transport cancellation and cancels late response",async()=>{
 let resolve!:(response:Response)=>void,signal:AbortSignal|undefined,cancelled=false;
 const provider=new StripePaymentProvider({...config,timeoutMs:20},async(_url,options)=>{signal=options?.signal??undefined;return new Promise<Response>(done=>{resolve=done;});});
 await assert.rejects(provider.createCheckout(scope),/PAYMENT_PROVIDER_UNAVAILABLE/);assert.equal(signal?.aborted,true);
 resolve(new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{"content-type":"application/json"}}));await new Promise(done=>setImmediate(done));assert.equal(cancelled,true);
});
test("deadline includes response parsing and cancels stalled readers",async()=>{
 let cancelled=false;const provider=new StripePaymentProvider({...config,timeoutMs:20},async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{"content-type":"application/json"}}));
 await assert.rejects(provider.verifyPayment(reference),/PAYMENT_PROVIDER_UNAVAILABLE/);assert.equal(cancelled,true);
});
