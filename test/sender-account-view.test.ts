import assert from "node:assert/strict";
import test from "node:test";
import {parseHTML} from "linkedom";
import {mountSenderAccount} from "../src/client/sender-account-view.js";
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});
function assessment(ready=true,expires=Date.now()+60000){return {status:"assessed",retryRequired:!ready,language:"en",discoveryReference:"synthetic",environmentSource:"automatic",validation:{missingTools:ready?[]:["upload"],assessment:{environment:{country:"NO",network:"test",provider:"test",client:"test",platform:"android",softwareVersion:"1"},status:ready?"verified":"not-ready",requiredChecks:ready?[]:["upload"],reasons:ready?[]:["UPLOAD_NOT_READY"],checkedAt:new Date().toISOString(),expiresAt:new Date(expires).toISOString()}}};}
function licenses(active=true,expiresAt=Date.now()+86400000){const checkedAt=new Date().toISOString();return {checkedAt,licenses:active?[{plan:"individual",startsAt:new Date(Date.now()-86400000).toISOString(),expiresAt:new Date(expiresAt).toISOString(),amountPaidUsdCents:400,status:"active",active:true}]:[]};}
function fixture(request:typeof fetch){
 const {document}=parseHTML('<html><body><main><p>Previous host content</p></main></body></html>'),container=document.querySelector("main") as unknown as HTMLElement,listeners=new Set<()=>void>();let user:string|undefined="a",token="token-a";
 const session={currentCustomer:()=>user,async accessToken(){return token;},subscribe(callback:()=>void){listeners.add(callback);return ()=>listeners.delete(callback);},change(value:string|undefined,nextToken=`token-${value}`){user=value;token=nextToken;for(const callback of [...listeners])callback();}};
 const mounted=mountSenderAccount(container,session,{apiOrigin:"https://app.example",request,billing:{autoLoadStatus:false},connection:{retry:{maxAttempts:1,delayMs:0}}});return {container,session,listeners,mounted};
}
const flush=()=>new Promise(done=>setImmediate(done));
test("account composition mounts both panels and refreshes connection then saved licensing before send",async()=>{
 const sent:string[]=[],tokens:string[]=[];const f=fixture(async(url,init)=>{sent.push(String(url));tokens.push((init!.headers as any).authorization);assert.equal(init!.credentials,"omit");return String(url).endsWith("license-status")?json(licenses()):json(assessment());});
 try{await flush();assert.ok(f.container.querySelector("[data-sender-billing]"));assert.ok(f.container.querySelector("[data-sender-connection]"));f.session.change("a","refreshed-token");assert.equal(await f.mounted.checkBeforeSending(),true);assert.deepEqual(sent,["https://app.example/v1/connection/check","https://app.example/v1/connection/check","https://app.example/v1/billing/license-status"]);assert.deepEqual(tokens,["Bearer token-a","Bearer refreshed-token","Bearer refreshed-token"]);assert.equal(sent.some(x=>x.endsWith("checkout")||x.includes("transfers")),false);}finally{f.mounted.dispose();assert.equal(f.listeners.size,0);assert.equal(f.container.childNodes.length,0);}
});
test("missing inactive or unavailable licensing blocks a verified connection",async()=>{
 for(const outcome of ["missing","expired","unavailable"]){const f=fixture(async url=>String(url).endsWith("license-status")?outcome==="unavailable"?json({error:"PRIVATE_DATABASE"},503):outcome==="missing"?json(licenses(false)):json({checkedAt:new Date().toISOString(),licenses:[{plan:"business",startsAt:"2024-01-01T00:00:00.000Z",expiresAt:"2025-01-01T00:00:00.000Z",amountPaidUsdCents:1000,status:"active",active:false}]}):json(assessment()));try{await flush();assert.equal(f.mounted.connection.isReady(),true);assert.equal(await f.mounted.checkBeforeSending(),false);}finally{f.mounted.dispose();}}
});
test("connection failures block preflight without issuing a license request",async()=>{
 let reads=0;const f=fixture(async url=>{if(String(url).endsWith("license-status")){reads++;return json(licenses());}return json(assessment(false));});try{await flush();assert.equal(await f.mounted.checkBeforeSending(),false);assert.equal(reads,0);}finally{f.mounted.dispose();}
});
test("account switching away and back aborts licensing and cannot revive old send preflight",async()=>{
 let release!:(response:Response)=>void,entered!:()=>void,signal:AbortSignal|undefined;const started=new Promise<void>(done=>{entered=done;});
 const f=fixture(async(url,init)=>{if(String(url).endsWith("license-status")){signal=init?.signal??undefined;entered();return new Promise(done=>{release=done;});}return json(assessment());});
 try{await flush();const pending=f.mounted.checkBeforeSending();await started;f.session.change("b");f.session.change("a","new-token-a");assert.equal(signal?.aborted,true);assert.equal(await pending,false);release(json(licenses()));await flush();assert.equal(f.mounted.connection.isReady(),true);}finally{f.mounted.dispose();}
});
test("a superseded license preflight cannot allow the host after a newer check",async()=>{
 let release!:(response:Response)=>void,entered!:()=>void,reads=0;const started=new Promise<void>(done=>{entered=done;});
 const f=fixture(async url=>{if(String(url).endsWith("license-status")&&++reads===1){entered();return new Promise(done=>{release=done;});}return json(String(url).endsWith("license-status")?licenses():assessment());});
 try{await flush();const first=f.mounted.checkBeforeSending();await started;const second=f.mounted.checkBeforeSending();assert.equal(await second,true);assert.equal(await first,false);release(json(licenses()));await flush();}finally{f.mounted.dispose();}
});
test("withdrawn connection evidence during license reading blocks the host action",async()=>{
 let release!:(response:Response)=>void,entered!:()=>void;const started=new Promise<void>(done=>{entered=done;});
 const f=fixture(async url=>{if(String(url).endsWith("license-status")){entered();return new Promise(done=>{release=done;});}return json(assessment());});
 try{await flush();const pending=f.mounted.checkBeforeSending();await started;f.mounted.connection.model.invalidateConnection();release(json(licenses()));assert.equal(await pending,false);}finally{f.mounted.dispose();}
});
test("signed-out and disposed accounts perform no send checks and pending reads are cancelled",async()=>{
 let release!:(response:Response)=>void,entered!:()=>void,signal:AbortSignal|undefined,calls=0;const started=new Promise<void>(done=>{entered=done;});
 const f=fixture(async(url,init)=>{calls++;if(String(url).endsWith("license-status")){signal=init?.signal??undefined;entered();return new Promise(done=>{release=done;});}return json(assessment());});
 await flush();f.session.change(undefined);const count=calls;assert.equal(await f.mounted.checkBeforeSending(),false);assert.equal(calls,count);f.session.change("a");await flush();const pending=f.mounted.checkBeforeSending();await started;f.mounted.dispose();assert.equal(signal?.aborted,true);assert.equal(await pending,false);assert.equal(await f.mounted.checkBeforeSending(),false);release(json(licenses()));await flush();assert.equal(f.listeners.size,0);assert.equal(f.container.childNodes.length,0);
});
test("invalid account origins are rejected before mounting or reading tokens",()=>{
 const {document}=parseHTML('<html><body><main>Keep host content</main></body></html>'),container=document.querySelector("main") as unknown as HTMLElement;let calls=0;
 const session={currentCustomer:()=>"a",async accessToken(){calls++;return "token";},subscribe(){calls++;return ()=>{};}};
 for(const apiOrigin of ["http://app.example","https://user@app.example","https://app.example/","https://app.example/path","https://app.example?token=x"]){assert.throws(()=>mountSenderAccount(container,session,{apiOrigin}),/INVALID_SENDER_ACCOUNT_ORIGIN/);assert.equal(container.textContent,"Keep host content");}assert.equal(calls,0);
});
test("a license that expires while its status response is pending cannot allow sending",async()=>{
 let release!:(response:Response)=>void,entered!:()=>void,captured:ReturnType<typeof licenses>;const started=new Promise<void>(done=>{entered=done;});
 const f=fixture(async url=>{if(String(url).endsWith("license-status")){captured=licenses(true,Date.now()+50);entered();return new Promise(done=>{release=done;});}return json(assessment());});
 try{await flush();const pending=f.mounted.checkBeforeSending();await started;await new Promise(done=>setTimeout(done,80));release(json(captured!));assert.equal(await pending,false);}finally{f.mounted.dispose();}
});
