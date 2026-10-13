import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";

test("standalone browser bundle imports without Node or DOM globals and performs an authenticated check",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"connection-browser-"));
 try{
  const file=join(dir,"connection-assistance.mjs");await promisify(execFile)(process.execPath,["scripts/build-connection-browser.mjs",file]);
  const source=await readFile(file,"utf8");
  assert.equal(/(?:from\s*["']node:|require\(["']node:)/.test(source),false);
  assert.equal(source.includes("SUPABASE_SECRET_KEY"),false);
  const browser=await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  assert.equal(typeof browser.BillingClient,"function");assert.equal(typeof browser.mountSessionBilling,"function");
  assert.equal(typeof browser.mountConnectionAssistance,"function");assert.equal(typeof browser.mountSessionConnectionAssistance,"function");assert.equal(Object.keys(browser.CONNECTION_TRANSLATIONS).length,42);assert.equal(browser.selectConnectionLanguage("fa-IR"),"fa");assert.equal(browser.selectPreferredConnectionLanguage(["is-IS","ar-KW"]),"ar");
  assert.throws(()=>new browser.ConnectionCheckClient("http://test.example/v1/connection",async()=>"test-token"),/INVALID_CONNECTION_CLIENT_CONFIGURATION/);
  let calls=0;const client=new browser.ConnectionCheckClient("https://test.example/v1/connection",async()=>"test-token",async(url:string,init:RequestInit)=>{
   calls++;assert.equal(url,"https://test.example/v1/connection/check");assert.equal((init.headers as Record<string,string>).authorization,"Bearer test-token");assert.equal(init.credentials,"omit");
   return new Response(JSON.stringify({status:"pending-internal-retry",retryRequired:true,language:"fa",reason:"AUTOMATIC_CONNECTION_CHECK_UNAVAILABLE"}),{status:503,headers:{"content-type":"application/json"}});
  });
  const result=await client.check({language:"fa"});assert.equal(result.status,"pending-internal-retry");assert.equal(calls,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
