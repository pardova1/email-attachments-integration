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
