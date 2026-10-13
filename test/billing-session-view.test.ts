import assert from "node:assert/strict";
import test from "node:test";
import {parseHTML} from "linkedom";
import {mountSessionBilling,BILLING_LABELS} from "../src/client/billing-session-view.js";
const checkout={checkoutId:"cs_test_demo",providerReference:"stripe-checkout:cs_test_demo",checkoutUrl:"https://checkout.stripe.com/c/pay/demo"},license={plan:"individual",startsAt:"2026-10-13T00:00:00.000Z",expiresAt:"2030-10-13T00:00:00.000Z",amountPaidUsdCents:400,status:"active"};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});
function fixture(request:typeof fetch,onConfirmed?:(license:any)=>void){
 const {document,window}=parseHTML('<html><body><main></main></body></html>'),container=document.querySelector("main") as unknown as HTMLElement;let user:string|undefined="a",changed:()=>void=()=>{},stopped=0;
 const session={currentCustomer:()=>user,async accessToken(){return `token-${user}`;},subscribe(callback:()=>void){changed=callback;return ()=>{stopped++;};}};
 const mounted=mountSessionBilling(container,session,{apiBase:"https://app.example/v1/billing",request,onConfirmed});return {container,window,mounted,session,setUser(value:string|undefined){user=value;changed();},get stopped(){return stopped;}};
}
test("billing panel requires explicit checkout and confirmation; no return URL grants access",async()=>{
 let calls=0,confirmed=0;const f=fixture(async(url,init)=>{calls++;assert.equal((init!.headers as any).authorization,"Bearer token-a");return String(url).endsWith("checkout")?json(checkout,201):json(license);},()=>{confirmed++;});
 try{assert.equal(calls,0);await f.mounted.confirmNow();assert.equal(calls,0);await f.mounted.checkoutNow();assert.equal(calls,1);assert.equal(confirmed,0);const link=f.container.querySelector("a")!;assert.equal(link.href,checkout.checkoutUrl);assert.equal(link.rel,"noopener noreferrer");assert.equal(link.getAttribute("referrerpolicy"),"no-referrer");await f.mounted.checkoutNow();assert.equal(calls,1);await f.mounted.confirmNow();assert.equal(confirmed,1);assert.ok(f.container.textContent?.includes(license.expiresAt));}finally{f.mounted.dispose();}
});
test("failed checkout retry reuses purchase ID and freezes plan until explicitly reset",async()=>{
 const sent:any[]=[];const f=fixture(async(_url,init)=>{sent.push(JSON.parse(String(init!.body)));return sent.length===1?json({error:"BILLING_BUSY"},503):json(checkout,201);});
 try{await f.mounted.checkoutNow();assert.ok(f.container.textContent?.includes(BILLING_LABELS.busy));assert.equal(f.container.querySelector("select")!.disabled,true);await f.mounted.checkoutNow();assert.equal(sent[0].requestId,sent[1].requestId);assert.equal(sent[0].plan,"individual");const buttons=f.container.querySelectorAll("button");buttons[2].dispatchEvent(new f.window.Event("click"));await f.mounted.checkoutNow();assert.notEqual(sent[2].requestId,sent[1].requestId);}finally{f.mounted.dispose();}
});
test("account change removes checkout and aborts old work; late verification cannot notify",async()=>{
 let release!:(response:Response)=>void,entered!:()=>void,signal:AbortSignal|undefined,confirmed=0;const started=new Promise<void>(done=>{entered=done;});
 const f=fixture(async(url,init)=>{if(String(url).endsWith("checkout"))return json(checkout,201);signal=init?.signal??undefined;entered();return new Promise(done=>{release=done;});},()=>{confirmed++;});
 try{await f.mounted.checkoutNow();const pending=f.mounted.confirmNow();await started;f.setUser("b");assert.equal(signal?.aborted,true);assert.equal(f.container.querySelector("a")!.hasAttribute("href"),false);await pending;release(json(license));await new Promise(done=>setImmediate(done));assert.equal(confirmed,0);assert.equal(f.container.textContent?.includes(license.expiresAt),false);}finally{f.mounted.dispose();}
});
test("signed-out account starts no request and session token races are rejected",async()=>{
 let calls=0,release!:(token:string)=>void;const f=fixture(async()=>{calls++;return json(checkout,201);});
 try{f.setUser(undefined);await f.mounted.checkoutNow();assert.equal(calls,0);assert.ok(f.container.textContent?.includes(BILLING_LABELS.signedOut));f.setUser("a");f.session.accessToken=async()=>new Promise(done=>{release=done;});const pending=f.mounted.checkoutNow();f.setUser("b");await pending;release("private-token-a");await new Promise(done=>setImmediate(done));assert.equal(calls,0);}finally{f.mounted.dispose();}
});
test("failed re-confirmation never repeats a previous confirmation callback",async()=>{
 let confirms=0,notifications=0;const f=fixture(async url=>String(url).endsWith("checkout")?json(checkout,201):++confirms===1?json(license):json({error:"PAYMENT_CONFIRMATION_REJECTED"},409),()=>{notifications++;});
 try{await f.mounted.checkoutNow();await f.mounted.confirmNow();await f.mounted.confirmNow();assert.equal(notifications,1);assert.ok(f.container.textContent?.includes(BILLING_LABELS.rejected));}finally{f.mounted.dispose();}
});
test("disposal cancels pending work removes session listeners and clears panel",async()=>{
 let entered!:()=>void,signal:AbortSignal|undefined;const started=new Promise<void>(done=>{entered=done;}),f=fixture(async(_url,init)=>{signal=init?.signal??undefined;entered();return new Promise(()=>{});});
 const pending=f.mounted.checkoutNow();await started;f.mounted.dispose();await pending;assert.equal(signal?.aborted,true);assert.equal(f.stopped,1);assert.equal(f.container.childNodes.length,0);f.mounted.dispose();assert.equal(f.stopped,1);
});
test("business selection uses shared prices and translated labels are inserted as text",async()=>{
 const {document,window}=parseHTML('<html><body><main></main></body></html>'),container=document.querySelector("main") as unknown as HTMLElement;let body:any;
 const session={currentCustomer:()=>"a",async accessToken(){return "token";},subscribe(){return ()=>{};}};
 const mounted=mountSessionBilling(container,session,{apiBase:"https://app.example/v1/billing",language:"ar",direction:"rtl",labels:{...BILLING_LABELS,title:"<img src=x onerror=alert(1)>"},request:async(_url,init)=>{body=JSON.parse(String(init!.body));return json(checkout,201);}});
 try{assert.equal(container.querySelector("img"),null);assert.equal(container.querySelector("section")!.dir,"rtl");assert.ok(container.textContent?.includes("$10.00"));const select=container.querySelector("select")!;select.options[1].selected=true;select.options[0].removeAttribute("selected");select.dispatchEvent(new window.Event("change"));await mounted.checkoutNow();assert.equal(body.plan,"business");}finally{mounted.dispose();}
});
