import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {ConnectionCheckClient,ConnectionClientError} from "../src/client/connection-check-client.js";
import {createConnectionCheckRouter} from "../src/http/connection-check-router.js";
import {AutomaticConnectionCoordinator} from "../src/email/automatic-connection-coordinator.js";
import {CustomerConnectionFallback} from "../src/email/customer-connection-fallback.js";
import {GlobalConnectionReadinessAgent} from "../src/email/global-connection-readiness-agent.js";
const base="https://app.example/v1/connection";
const known={network:"test-network",provider:"test-provider",client:"test-browser",platform:"android",softwareVersion:"1.0"};
function fallback(){return {status:"customer-input-required",retryRequired:true,language:"en",direction:"ltr",languageOptions:[{tag:"en",label:"English"}],form:{id:"11111111-1111-4111-8111-111111111111",message:"Choose missing details",expiresAt:new Date(Date.now()+60_000).toISOString(),fields:[{key:"country",label:"Country",options:[{id:"kw",label:"Kuwait",value:"KW",requires:{}}]}]}};}
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
const code=(expected:string)=>(error:unknown)=>error instanceof ConnectionClientError&&error.code===expected;
test("client refreshes authorization per request and sends only connection selections",async()=>{
 let tokens=0,requests=0;
 const client=new ConnectionCheckClient(base,async()=>`token-${++tokens}`,async(input,init)=>{
  requests++;assert.equal(String(input),`${base}/${requests===1?"check":"selections"}`);assert.equal(init?.credentials,"omit");assert.equal(init?.redirect,"error");assert.equal(init?.cache,"no-store");
  assert.equal((init?.headers as Record<string,string>).authorization,`Bearer token-${requests}`);
  const body=JSON.parse(init!.body as string);assert.equal("userId" in body,false);assert.equal("accessToken" in body,false);
  return response(fallback());
 });
 const result=await client.check({language:"ar-KW"});assert.equal(result.status,"customer-input-required");
 await client.submit({formId:fallback().form.id,selections:{country:"kw"},language:"fa"});assert.equal(tokens,2);
});
test("client submits a real customer-bound fallback through the HTTP router",async()=>{
 const formStore=new CustomerConnectionFallback({country:[{id:"kw",label:"Kuwait",value:"KW"}]});
 const app=express();app.use(express.json());app.use("/v1/connection",createConnectionCheckRouter({authenticator:{async authenticate(value){assert.equal(value,"Bearer test-token");return {userId:"sender-a"};}},async coordinatorFor(customer){return new AutomaticConnectionCoordinator({async discover(){return {environment:known,observedAt:new Date().toISOString(),sourceReference:"synthetic"};}},{async toolsFor(){return {};}},new GlobalConnectionReadinessAgent(),undefined,10_000,formStore,customer.userId);}}));
 const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));const address=server.address();if(!address||typeof address==="string")throw new Error("TEST_ADDRESS_REQUIRED");
 try{
  // Rewrite only the test transport to a local HTTP server; shipped clients require HTTPS.
  const client=new ConnectionCheckClient(base,async()=>"test-token",async(input,init)=>fetch(`http://127.0.0.1:${address.port}${new URL(String(input)).pathname}`,init));
  const result=await client.check({language:"fa-IR"});assert.equal(result.status,"customer-input-required");if(result.status!=="customer-input-required")throw new Error("EXPECTED_FORM");assert.equal(result.direction,"rtl");
  const selected=await client.submit({formId:result.form.id,selections:{country:"kw"},language:"ar-KW"});assert.equal(selected.status,"assessed");if(selected.status!=="assessed")throw new Error("EXPECTED_ASSESSMENT");assert.equal(selected.validation.assessment.status,"not-ready");assert.equal(selected.retryRequired,true);
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
test("invalid inputs and missing access tokens send no request",async()=>{
 let requests=0;const client=new ConnectionCheckClient(base,async()=>"",async()=>{requests++;return response(fallback());});
 await assert.rejects(client.check(),code("AUTHENTICATION_REQUIRED"));
 await assert.rejects(client.check({userId:"spoofed"} as never),code("REQUEST_REJECTED"));
 await assert.rejects(client.submit({formId:"invalid",selections:{country:"kw"}}),code("REQUEST_REJECTED"));assert.equal(requests,0);
});
test("server errors expose safe client codes rather than tokens or private messages",async()=>{
 for(const [status,expected] of [[401,"AUTHENTICATION_REQUIRED"],[400,"REQUEST_REJECTED"],[503,"CHECK_UNAVAILABLE"]] as const){
  const client=new ConnectionCheckClient(base,async()=>"private-token",async()=>response({error:"PRIVATE_SERVER_DETAIL"},status));
  await assert.rejects(client.check(),error=>code(expected)(error)&&!String(error).includes("PRIVATE"));
 }
 const client=new ConnectionCheckClient(base,async()=>"private-token",async()=>{throw new Error("PRIVATE_NETWORK_DETAIL");});await assert.rejects(client.check(),code("CHECK_UNAVAILABLE"));
});
test("malformed oversized and expired responses cannot be presented as readiness",async()=>{
 const expired=fallback();expired.form.expiresAt=new Date(Date.now()-1).toISOString();
 for(const value of [response({status:"verified"}),response(expired),new Response("<html>Login</html>",{headers:{"content-type":"text/html"}}),response({padding:"x".repeat(128*1024)})]){
  await assert.rejects(new ConnectionCheckClient(base,async()=>"token",async()=>value).check(),code("INVALID_RESPONSE"));
 }
});
test("verified responses require fresh consistent evidence and empty missing checks",async()=>{
 const now=new Date(),verified={status:"assessed",retryRequired:false,language:"en",discoveryReference:"synthetic",environmentSource:"automatic",validation:{missingTools:[],assessment:{environment:{...known,country:"KW"},status:"verified",requiredChecks:[],reasons:[],checkedAt:now.toISOString(),expiresAt:new Date(now.getTime()+60_000).toISOString()}}};
 assert.equal((await new ConnectionCheckClient(base,async()=>"token",async()=>response(verified)).check()).status,"assessed");
 for(const patch of [{retryRequired:true},{validation:{...verified.validation,missingTools:["upload"]}},{validation:{...verified.validation,assessment:{...verified.validation.assessment,expiresAt:now.toISOString()}}}]){
  await assert.rejects(new ConnectionCheckClient(base,async()=>"token",async()=>response({...verified,...patch})).check(),code("INVALID_RESPONSE"));
 }
});
test("timeouts and cancellation release pending tokens and body streams",async()=>{
 await assert.rejects(new ConnectionCheckClient(base,async()=>new Promise(()=>{}),undefined,10).check(),code("CHECK_UNAVAILABLE"));
 const controller=new AbortController();let entered!:()=>void,cancelled=false;const started=new Promise<void>(resolve=>{entered=resolve;});
 const client=new ConnectionCheckClient(base,async()=>"token",async()=>new Response(new ReadableStream({pull(){entered();return new Promise(()=>{});},cancel(){cancelled=true;}}),{headers:{"content-type":"application/json"}}));
 const pending=client.check({},controller.signal);await started;controller.abort();await assert.rejects(pending,{name:"AbortError"});assert.equal(cancelled,true);
});
test("client configuration rejects plaintext credentials and query secrets",()=>{
 for(const url of ["http://app.example/v1/connection","https://user:secret@app.example/v1/connection","https://app.example/v1/connection?token=secret","https://app.example/other"]){assert.throws(()=>new ConnectionCheckClient(url,async()=>"token"),/INVALID_CONNECTION_CLIENT_CONFIGURATION/);}
});
