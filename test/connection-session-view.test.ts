import assert from "node:assert/strict";
import test from "node:test";
import {parseHTML} from "linkedom";
import {mountSessionConnectionAssistance} from "../src/client/connection-session-view.js";
function session(){let customer:string|undefined="a",token="token-a";const listeners=new Set<()=>void>();return {currentCustomer:()=>customer,async accessToken(){return token;},subscribe(changed:()=>void){listeners.add(changed);return ()=>listeners.delete(changed);},change(next:string|undefined,nextToken=""){customer=next;token=nextToken;for(const listener of listeners)listener();},listeners};}
function container(){return parseHTML('<html><body><main id="connection"></main></body></html>').document.getElementById("connection") as unknown as HTMLElement;}
function verified(){const now=Date.now();return {status:"assessed",retryRequired:false,language:"en",discoveryReference:"synthetic",environmentSource:"automatic",validation:{missingTools:[],assessment:{environment:{country:"NO",network:"test",provider:"test",client:"test",platform:"android",softwareVersion:"1"},status:"verified",requiredChecks:[],reasons:[],checkedAt:new Date(now).toISOString(),expiresAt:new Date(now+60_000).toISOString()}}};}
const response=(body:unknown)=>new Response(JSON.stringify(body),{headers:{"content-type":"application/json"}});
async function flush(){await new Promise(resolve=>setImmediate(resolve));}
test("sign-out clears readiness and account switching starts a fresh authenticated check",async()=>{
 const auth=session(),node=container(),changes:boolean[]=[],tokens:string[]=[];
 const mounted=mountSessionConnectionAssistance(node,auth,{apiBase:"https://app.example/v1/connection",language:"fa",onReadinessChange(value){changes.push(value);},async request(_url,init){tokens.push((init?.headers as Record<string,string>).authorization);assert.equal("userId" in JSON.parse(init!.body as string),false);return response(verified());}});
 try{
  await flush();assert.equal(mounted.isReady(),true);auth.change(undefined);assert.equal(mounted.isReady(),false);assert.equal(mounted.model.state().result,undefined);
  auth.change("b","token-b");assert.equal(mounted.isReady(),false);await flush();assert.equal(mounted.isReady(),true);assert.deepEqual(tokens,["Bearer token-a","Bearer token-b"]);assert.deepEqual(changes,[false,true,false,true]);assert.equal(mounted.model.state().language,"fa");
  auth.change("b","refreshed-token-b");await flush();assert.equal(tokens.length,2);
 }finally{mounted.dispose();}
 assert.equal(auth.listeners.size,0);assert.equal(mounted.isReady(),false);assert.equal(changes.at(-1),false);assert.equal(node.childNodes.length,0);
});
test("a token resolving after an account switch is discarded before transport",async()=>{
 const auth=session();let finish!:(token:string)=>void,calls=0;
 auth.accessToken=async()=>new Promise(resolve=>{finish=resolve;});
 const mounted=mountSessionConnectionAssistance(container(),auth,{apiBase:"https://app.example/v1/connection",async request(){calls++;return response(verified());}});
 await flush();auth.change(undefined);finish("token-a");await flush();assert.equal(calls,0);assert.equal(mounted.isReady(),false);assert.equal(mounted.model.state().result,undefined);mounted.dispose();
});
test("late old-account replies cannot restore readiness and invalid sessions send no requests",async()=>{
 const auth=session();let finish!:(response:Response)=>void,signal:AbortSignal|undefined,calls=0;
 const mounted=mountSessionConnectionAssistance(container(),auth,{apiBase:"https://app.example/v1/connection",async request(_url,init){calls++;signal=init?.signal??undefined;return new Promise(resolve=>{finish=resolve;});}});
 await flush();auth.change(undefined);assert.equal(signal?.aborted,true);finish(response(verified()));await flush();assert.equal(mounted.isReady(),false);assert.equal(mounted.model.state().result,undefined);
 auth.change(" invalid ","bad-token");await flush();assert.equal(calls,1);mounted.dispose();
});

test("send preflight refreshes prior readiness with current credentials before allowing the host action",async()=>{
 const auth=session(),tokens:string[]=[],changes:boolean[]=[];let allow=true;
 const mounted=mountSessionConnectionAssistance(container(),auth,{apiBase:"https://app.example/v1/connection",language:"fa",onReadinessChange(value){changes.push(value);},async request(_url,init){tokens.push((init?.headers as Record<string,string>).authorization);const result=verified();if(!allow){result.retryRequired=true;result.validation.assessment.status="not-ready";}return response(result);}});
 try{
  await flush();assert.equal(mounted.isReady(),true);auth.change("a","refreshed-token");
  const checking=mounted.checkBeforeSending();assert.equal(mounted.isReady(),false);assert.equal(await checking,true);assert.deepEqual(tokens,["Bearer token-a","Bearer refreshed-token"]);
  allow=false;assert.equal(await mounted.checkBeforeSending(),false);assert.equal(mounted.isReady(),false);assert.equal(mounted.model.state().language,"fa");assert.deepEqual(changes,[false,true,false,true,false]);
 }finally{mounted.dispose();}
});
test("send preflight remains blocked for missing details internal retry and authentication failure",async()=>{
 const auth=session();let outcome="verified",calls=0;
 const mounted=mountSessionConnectionAssistance(container(),auth,{apiBase:"https://app.example/v1/connection",retry:{maxAttempts:1,delayMs:0},async request(){calls++;if(outcome==="auth")return new Response("{}",{status:401});if(outcome==="pending")return new Response(JSON.stringify({status:"pending-internal-retry",retryRequired:true,reason:"AUTOMATIC_CONNECTION_CHECK_UNAVAILABLE",language:"en"}),{status:503,headers:{"content-type":"application/json"}});if(outcome==="form")return response({status:"customer-input-required",retryRequired:true,language:"en",direction:"ltr",languageOptions:[{tag:"en",label:"English"}],form:{id:"11111111-1111-4111-8111-111111111111",message:"Choose",expiresAt:new Date(Date.now()+60000).toISOString(),fields:[{key:"country",label:"Country",options:[{id:"no",label:"Norway",value:"NO"}]}]}});return response(verified());}});
 try{
  await flush();for(const next of ["form","pending","auth"]){outcome=next;assert.equal(await mounted.checkBeforeSending(),false);assert.equal(mounted.isReady(),false);}
  assert.equal(calls,4);auth.change(undefined);assert.equal(await mounted.checkBeforeSending(),false);assert.equal(calls,4);
 }finally{mounted.dispose();}
});
test("account switching away and back invalidates an old send preflight even after new readiness",async()=>{
 const auth=session();let calls=0,release!:(value:Response)=>void;
 const mounted=mountSessionConnectionAssistance(container(),auth,{apiBase:"https://app.example/v1/connection",async request(){calls++;if(calls===2)return new Promise(resolve=>{release=resolve;});return response(verified());}});
 try{
  await flush();const pending=mounted.checkBeforeSending();await flush();auth.change("b","token-b");auth.change("a","new-token-a");await flush();assert.equal(mounted.isReady(),true);
  release(response(verified()));assert.equal(await pending,false);assert.equal(mounted.isReady(),true);
 }finally{mounted.dispose();}
});
test("a superseded or disposed send preflight cannot allow the host action",async()=>{
 const auth=session();let calls=0,release!:(value:Response)=>void;
 const mounted=mountSessionConnectionAssistance(container(),auth,{apiBase:"https://app.example/v1/connection",async request(){calls++;if(calls===2||calls===4)return new Promise(resolve=>{release=resolve;});return response(verified());}});
 try{
  await flush();const first=mounted.checkBeforeSending();await flush();const second=mounted.checkBeforeSending();assert.equal(await second,true);release(response(verified()));assert.equal(await first,false);
  const closing=mounted.checkBeforeSending();await flush();mounted.dispose();release(response(verified()));assert.equal(await closing,false);assert.equal(await mounted.checkBeforeSending(),false);
 }finally{mounted.dispose();}
});
test("send preflight respects the offline UI pause without requesting a token or transport",async()=>{
 const auth=session(),{document,window}=parseHTML('<html><body><main></main></body></html>');Object.defineProperty(document,"defaultView",{value:{navigator:{onLine:false},addEventListener:window.addEventListener.bind(window),removeEventListener:window.removeEventListener.bind(window)},configurable:true});let tokens=0,calls=0;auth.accessToken=async()=>{tokens++;return "token";};
 const mounted=mountSessionConnectionAssistance(document.querySelector("main") as unknown as HTMLElement,auth,{apiBase:"https://app.example/v1/connection",async request(){calls++;return response(verified());}});
 try{assert.equal(await mounted.checkBeforeSending(),false);assert.equal(tokens,0);assert.equal(calls,0);assert.equal(mounted.isReady(),false);}finally{mounted.dispose();}
});
