import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { SenderTransferAccessService } from "../src/services/sender-transfer-access.js";
import { RecipientAccessService } from "../src/services/recipient-access.js";

test("live HTTP sender routes reject absent wrong-transfer and recipient credentials",async(t)=>{
 const child=spawn(process.execPath,["--import","tsx","src/server.ts"],{
  env:{...process.env,NODE_ENV:"development",PORT:"0",SUPABASE_URL:"",SUPABASE_SECRET_KEY:"",SUPABASE_PUBLISHABLE_KEY:"",TOKEN_SIGNING_SECRET:"http-test-secret",STAFF_SIGNING_SECRET:"staff-test-secret"},
  stdio:["ignore","pipe","pipe"]
 });
 t.after(()=>{child.kill();});
 const port=await new Promise<number>((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(new Error("SERVER_START_TIMEOUT")),10_000);
  let output="";
  child.stdout.on("data",data=>{
   output+=data.toString();const match=output.match(/listening on :(\d+)/);
   if(match){clearTimeout(timeout);resolve(Number(match[1]));}
  });
  child.once("error",error=>{clearTimeout(timeout);reject(error);});
  child.once("exit",()=>{clearTimeout(timeout);reject(new Error("SERVER_START_FAILED"));});
 });
 const sender=new SenderTransferAccessService("http-test-secret");
 const recipient=new RecipientAccessService("http-test-secret");
 const deadline=new Date(Date.now()+60_000);
 const invalid=[undefined,`Bearer ${sender.issue("another-transfer",deadline)}`,`Bearer ${recipient.issue("target",deadline)}`];
 const routes=[{method:"GET",path:"/v1/transfers/target"},{method:"PUT",path:"/v1/transfers/target/parts/1"},{method:"POST",path:"/v1/transfers/target/complete"}];
 for(const route of routes){
  for(const authorization of invalid){
   const response=await fetch(`http://127.0.0.1:${port}${route.path}`,{method:route.method,headers:authorization?{authorization}:{}});
   assert.equal(response.status,401,`${route.method} ${route.path}`);
   assert.deepEqual(await response.json(),{error:"SENDER_TRANSFER_AUTHORIZATION_REQUIRED"});
  }
 }
 const authorized=await fetch(`http://127.0.0.1:${port}/v1/transfers/target`,{headers:{authorization:`Bearer ${sender.issue("target",deadline)}`}});
 assert.equal(authorized.status,404); // A valid token reaches the service; this test ID has no session.
 assert.deepEqual(await authorized.json(),{error:"TRANSFER_NOT_FOUND"});
});
