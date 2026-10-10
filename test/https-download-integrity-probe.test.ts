import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {HttpsDownloadIntegrityProbe} from "../src/email/https-download-integrity-probe.js";
import {GlobalConnectionValidationRunner} from "../src/email/global-connection-validation-runner.js";
import {GlobalConnectionReadinessAgent,type ConnectionEnvironment} from "../src/email/global-connection-readiness-agent.js";
const environment:ConnectionEnvironment={country:"KW",network:"test-network",provider:"test-provider",client:"test-client",platform:"android",softwareVersion:"1.0"};
const fixture=Buffer.from("synthetic download fixture"),sha256=createHash("sha256").update(fixture).digest("hex");
function probe(request:typeof fetch){return new HttpsDownloadIntegrityProbe("https://service.example/fixture",environment,fixture.length,sha256,request);}
test("download probe verifies streamed bytes and records an isolated receipt",async()=>{
 const controller=new AbortController();
 const tool=probe(async(_url,init)=>{
  assert.equal(init?.method,"GET");assert.equal(init?.redirect,"error");assert.equal(init?.credentials,"omit");assert.equal(init?.signal,controller.signal);
  return new Response(new ReadableStream({start(stream){stream.enqueue(fixture.subarray(0,5));stream.enqueue(fixture.subarray(5));stream.close();}}));
 });
 const result=await tool.run(environment,controller.signal);assert.equal(result.outcome,"passed");assert.equal(result.recipientNeedsInstallation,undefined);
 const receipt=tool.receipt(result.testReference)!;assert.equal(receipt.bytesReceived,fixture.length);assert.equal(receipt.integrityVerified,true);
 receipt.environment.country="IR";assert.equal(tool.receipt(result.testReference)?.environment.country,"KW");
});
test("wrong country or software makes no download request",async()=>{
 let calls=0;const tool=probe(async()=>{calls++;return new Response(fixture);});
 for(const patch of [{country:"IR"},{softwareVersion:"2.0"},{network:"other"}])assert.equal((await tool.run({...environment,...patch},new AbortController().signal)).outcome,"failed");
 assert.equal(calls,0);
});
test("truncated corrupt oversized and unexpected responses cannot pass download integrity",async()=>{
 for(const response of [new Response(fixture.subarray(1)),new Response(Buffer.alloc(fixture.length)),new Response(Buffer.alloc(fixture.length+1)),new Response(fixture,{headers:{"content-length":"1"}}),new Response(fixture,{status:503})]){
  const tool=probe(async()=>response),result=await tool.run(environment,new AbortController().signal);assert.equal(result.outcome,"failed");
 }
 for(const status of [403,451])assert.equal((await probe(async()=>new Response(null,{status})).run(environment,new AbortController().signal)).outcome,"restricted");
});
test("oversized streams are cancelled before reading the remaining fixture",async()=>{
 let cancelled=false;
 const response=new Response(new ReadableStream({start(stream){stream.enqueue(Buffer.alloc(fixture.length+1));},cancel(){cancelled=true;}}));
 assert.equal((await probe(async()=>response).run(environment,new AbortController().signal)).outcome,"failed");assert.equal(cancelled,true);
});
test("abort releases a pending body read and cancels its stream",async()=>{
 let cancelled=false;const controller=new AbortController();let entered!:()=>void;
 const started=new Promise<void>(resolve=>{entered=resolve;});
 const tool=probe(async()=>new Response(new ReadableStream({pull(){entered();return new Promise(()=>{});},cancel(){cancelled=true;}})));
 const pending=tool.run(environment,controller.signal);await started;controller.abort();await assert.rejects(pending,{name:"AbortError"});assert.equal(cancelled,true);
});
test("fixture-only evidence cannot certify a recipient browser or no-install download",async()=>{
 const result=await new GlobalConnectionValidationRunner(new GlobalConnectionReadinessAgent(),{"recipient-download":probe(async()=>new Response(fixture))}).run(environment);
 assert.equal(result.assessment.status,"not-ready");assert.ok(result.assessment.reasons.includes("RECIPIENT_INSTALLATION_UNVERIFIED"));
});
test("probe rejects unsafe configuration and masks private network errors",async()=>{
 for(const target of ["http://service.example/fixture","https://user:secret@service.example/fixture","https://service.example/fixture?token=secret"]){
  assert.throws(()=>new HttpsDownloadIntegrityProbe(target,environment,fixture.length,sha256),/INVALID_DOWNLOAD_PROBE_CONFIGURATION/);
 }
 assert.throws(()=>new HttpsDownloadIntegrityProbe("https://service.example/fixture",environment,1024*1024+1,sha256),/INVALID_DOWNLOAD_PROBE_CONFIGURATION/);
 const tool=probe(async()=>{throw new Error("PRIVATE_NETWORK_DETAIL");}),result=await tool.run(environment,new AbortController().signal);
 assert.equal(result.outcome,"failed");assert.equal(JSON.stringify(tool.receipt(result.testReference)).includes("PRIVATE_NETWORK_DETAIL"),false);
});
test("native HTTPS downloads a streamed fixture using process-scoped test certificate trust",async()=>{
 const [{createServer},{mkdtemp,readFile,rm},{tmpdir},{join},{execFile},{promisify}]=await Promise.all([import("node:https"),import("node:fs/promises"),import("node:os"),import("node:path"),import("node:child_process"),import("node:util")]);
 const execute=promisify(execFile),directory=await mkdtemp(join(tmpdir(),"download-probe-")),key=join(directory,"key.pem"),certificate=join(directory,"certificate.pem");
 let server:ReturnType<typeof createServer>|undefined;
 try{
  await execute("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-days","1","-subj","/CN=localhost","-addext","subjectAltName=DNS:localhost,IP:127.0.0.1","-keyout",key,"-out",certificate]);
  server=createServer({key:await readFile(key),cert:await readFile(certificate)},(_request,response)=>{response.writeHead(200,{"content-type":"application/octet-stream"});response.write(fixture.subarray(0,5));response.end(fixture.subarray(5));});
  await new Promise<void>(resolve=>server!.listen(0,"127.0.0.1",resolve));
  const address=server.address();if(!address||typeof address==="string")throw new Error("TEST_SERVER_ADDRESS_REQUIRED");
  const script=`import {HttpsDownloadIntegrityProbe} from './src/email/https-download-integrity-probe.ts';const env=${JSON.stringify(environment)};const result=await new HttpsDownloadIntegrityProbe('https://127.0.0.1:${address.port}/fixture',env,${fixture.length},'${sha256}').run(env,AbortSignal.timeout(5000));if(result.outcome!=='passed')throw new Error('DOWNLOAD_FAILED');`;
  await execute(process.execPath,["--import","tsx","--input-type=module","-e",script],{cwd:process.cwd(),env:{...process.env,NODE_EXTRA_CA_CERTS:certificate},timeout:10_000});
 }finally{
  if(server)await new Promise<void>((resolve,reject)=>server!.close(error=>error?reject(error):resolve()));
  await rm(directory,{recursive:true,force:true});
 }
});
