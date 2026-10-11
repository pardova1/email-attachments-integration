import assert from "node:assert/strict";
import test from "node:test";
import {BrowserConnectionCheckClient,collectBrowserConnectionHints} from "../src/client/browser-connection-client.js";
test("browser hints request only full versions and ignore generic/unknown brands",async()=>{
 const result=await collectBrowserConnectionHints({userAgentData:{platform:"Android",async getHighEntropyValues(requested){assert.deepEqual(requested,["fullVersionList"]);return {fullVersionList:[{brand:"Not A Brand",version:"99.0.0.0"},{brand:"Chromium",version:"155.0.8000.1"},{brand:"Google Chrome",version:"155.0.8000.1"}]};}}});
 assert.deepEqual(result,{platform:"android",client:"Google Chrome",softwareVersion:"155.0.8000.1"});assert.equal("country" in result!,false);assert.equal("provider" in result!,false);
});
test("unavailable denied reduced conflicting and unknown metadata never invents an exact version",async()=>{
 assert.equal(await collectBrowserConnectionHints(undefined),undefined);
 for(const fullVersionList of [[{brand:"Google Chrome",version:"155.0.0.0"}],[{brand:"Google Chrome",version:"155"}],[{brand:"Google Chrome",version:"155.0.8000.1"},{brand:"Google Chrome",version:"155.0.8000.2"}],[{brand:"Google Chrome",version:"155.0.8000.1"},{brand:"Microsoft Edge",version:"155.0.8000.2"}],[{brand:"Chromium",version:"155.0.8000.1"}]]){
  const result=await collectBrowserConnectionHints({userAgentData:{platform:"Windows",async getHighEntropyValues(){return {fullVersionList};}}});assert.equal(result?.softwareVersion,undefined);
 }
 assert.deepEqual(await collectBrowserConnectionHints({userAgentData:{platform:"macOS",brands:[{brand:"Google Chrome",version:"155"}],async getHighEntropyValues(){throw new Error("PRIVATE_POLICY_DETAIL");}}}),{platform:"macos",client:"Google Chrome"});
});
test("hanging metadata is bounded and cancellation sends no request",async()=>{
 const navigator={userAgentData:{platform:"Android",async getHighEntropyValues(){return new Promise(()=>{});}}};
 assert.deepEqual(await collectBrowserConnectionHints(navigator,undefined,10),{platform:"android"});
 const controller=new AbortController();let calls=0;
 const client=new BrowserConnectionCheckClient("https://app.example/v1/connection",async()=>"token",async()=>{calls++;throw new Error("UNEXPECTED");},navigator);
 const pending=client.check({},controller.signal);controller.abort();await assert.rejects(pending,{name:"AbortError"});assert.equal(calls,0);
});
test("automatic hints reach authenticated JSON while explicit integration metadata takes precedence",async()=>{
 let metadataCalls=0;const sent:unknown[]=[];
 const client=new BrowserConnectionCheckClient("https://app.example/v1/connection",async()=>"token",async(_url,init)=>{sent.push(JSON.parse(init!.body as string));assert.equal((init?.headers as Record<string,string>).authorization,"Bearer token");return new Response(JSON.stringify({status:"pending-internal-retry",retryRequired:true,language:"en",reason:"AUTOMATIC_CONNECTION_CHECK_UNAVAILABLE"}),{status:503,headers:{"content-type":"application/json"}});},{userAgentData:{platform:"Windows",async getHighEntropyValues(){metadataCalls++;return {fullVersionList:[{brand:"Microsoft Edge",version:"155.0.8000.1"}]};}}});
 await client.check();await client.check({software:{client:"native-app",platform:"android",softwareVersion:"1.2.3"}});
 assert.deepEqual(sent,[{software:{platform:"windows",client:"Microsoft Edge",softwareVersion:"155.0.8000.1"}},{software:{client:"native-app",platform:"android",softwareVersion:"1.2.3"}}]);assert.equal(metadataCalls,1);
});
