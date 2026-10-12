import assert from "node:assert/strict";
import test from "node:test";
import {VaultTransitTransferKeyVault,type VaultTransitConfiguration} from "../src/adapters/vault-transit-transfer-key-vault.js";
import {createTransferKeyVault} from "../src/config/transfer-key-vault-factory.js";
import {TransferCryptoContextService} from "../src/security/transfer-crypto-context.js";
import {PrivateLaneLifecycleCoordinator} from "../src/security/private-lane-lifecycle-coordinator.js";
const config={address:"https://vault.example",token:"synthetic-token",namespace:"admin/team",mount:"bridge-transit"};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});
function remote(){
 const keys=new Map<string,Record<string,unknown>>(),calls:Array<{method:string;name:string}>=[];
 let deny=false,retain=false;
 const request:typeof fetch=async(input,options)=>{
  const url=new URL(String(input)),headers=new Headers(options?.headers),method=options?.method??"GET";
  assert.equal(url.origin,config.address);assert.equal(headers.get("X-Vault-Token"),config.token);assert.equal(headers.get("X-Vault-Namespace"),config.namespace);
  assert.equal(options?.redirect,"error");assert.equal(options?.credentials,"omit");assert.equal(options?.cache,"no-store");
  const match=url.pathname.match(/^\/v1\/bridge-transit\/keys\/(bridge-[a-f0-9]{64})(\/config)?$/);assert.ok(match);
  const name=match[1];calls.push({method,name});
  if(deny)return json({errors:["PRIVATE_TOKEN_DETAIL"]},403);
  if(method==="POST"&&!match[2]){keys.set(name,{name,...JSON.parse(String(options?.body)),deletion_allowed:false});return new Response(null,{status:204});}
  if(method==="GET")return keys.has(name)?json({data:keys.get(name)}):json({errors:[]},404);
  if(method==="POST"&&match[2]){assert.deepEqual(JSON.parse(String(options?.body)),{deletion_allowed:true});keys.get(name)!.deletion_allowed=true;return json({});}
  if(method==="DELETE"){if(keys.has(name))assert.equal(keys.get(name)!.deletion_allowed,true);if(!retain)keys.delete(name);return new Response(null,{status:204});}
  throw new Error("UNEXPECTED_REQUEST");
 };
 return {request,keys,calls,set deny(value:boolean){deny=value;},set retain(value:boolean){retain=value;}};
}

test("production configuration selects the managed adapter and rejects incomplete settings",()=>{
 assert.ok(createTransferKeyVault({NODE_ENV:"production",TRANSFER_KEY_VAULT_PROVIDER:"vault-transit",VAULT_ADDR:config.address,VAULT_TOKEN:config.token}) instanceof VaultTransitTransferKeyVault);
 for(const env of [{TRANSFER_KEY_VAULT_PROVIDER:"unknown"},{TRANSFER_KEY_VAULT_PROVIDER:"vault-transit"},{TRANSFER_KEY_VAULT_PROVIDER:"vault-transit",VAULT_ADDR:config.address,VAULT_TOKEN:config.token,TRANSFER_KEY_VAULT_TIMEOUT_MS:"1e3"}])assert.throws(()=>createTransferKeyVault(env),/INVALID_TRANSFER_KEY_VAULT_CONFIGURATION/);
});
test("unsafe vault URLs credentials paths and deadlines are rejected without requests",()=>{
 for(const update of [{address:"http://vault.example"},{address:"https://user:secret@vault.example"},{address:"https://vault.example/path"},{address:"https://vault.example/?token=secret"},{token:"a\nb"},{token:""},{mount:"../transit"},{namespace:"admin//team"},{timeoutMs:0},{timeoutMs:60_001}] as Partial<VaultTransitConfiguration>[]){assert.throws(()=>new VaultTransitTransferKeyVault({...config,...update}),/INVALID_TRANSFER_KEY_VAULT_CONFIGURATION/);}
});
test("isolated durable key references survive replacement and expired lane cleanup is repeatable",async()=>{
 const server=remote(),first=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService(new VaultTransitTransferKeyVault(config,server.request)));
 const a=await first.createForSend("transfer-a","lane-a"),b=await first.createForSend("transfer-b","lane-b");
 assert.notEqual(a.crypto.keyReference,b.crypto.keyReference);assert.equal(server.keys.size,2);assert.equal(a.crypto.keyReference.includes("transfer-a"),false);
 const replacement=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService(new VaultTransitTransferKeyVault({...config},server.request)));
 replacement.restoreFromReference(a.transferId,a.laneId,a.crypto.keyReference);
 await replacement.onExpired(a.transferId);assert.equal(replacement.get(a.transferId)?.status,"retired");assert.equal(server.keys.size,1);
 const next=new VaultTransitTransferKeyVault(config,server.request);await next.destroyKey(a.crypto.keyReference);assert.equal(server.keys.size,1);
 const reads=server.calls.filter(call=>call.method==="GET").length;
 assert.ok(reads>=5);await next.destroyKey(b.crypto.keyReference);assert.equal(server.keys.size,0);
});
test("old or foreign vault references never authorize deletion and token rotation retains binding",async()=>{
 const server=remote(),vault=new VaultTransitTransferKeyVault(config,server.request),ref=await vault.createKey({transferId:"a",laneId:"b"}),count=server.calls.length;
 for(const other of [{address:"https://other.example"},{mount:"other"},{namespace:"other"}])await assert.rejects(new VaultTransitTransferKeyVault({...config,...other},server.request).destroyKey(ref),/REFERENCE_REJECTED/);
 for(const bad of ["dev-key-old","vault-transit:v1:../../bad",ref+"/config"])await assert.rejects(vault.destroyKey(bad),/REFERENCE_REJECTED/);
 assert.equal(server.calls.length,count);
 const rotated:typeof fetch=(url,options)=>{const headers=new Headers(options?.headers);assert.equal(headers.get("X-Vault-Token"),"rotated-token");headers.set("X-Vault-Token",config.token);return server.request(url,{...options,headers});};
 await new VaultTransitTransferKeyVault({...config,token:"rotated-token"},rotated).destroyKey(ref);assert.equal(server.keys.size,0);
});
test("fresh allocation never resurrects the same retired key reference",async()=>{
 const server=remote(),vault=new VaultTransitTransferKeyVault(config,server.request),scope={transferId:"a",laneId:"b"};
 const first=await vault.createKey(scope);await vault.destroyKey(first);const second=await vault.createKey(scope);assert.notEqual(first,second);await vault.destroyKey(first);assert.equal(server.keys.size,1);
});
test("unsafe or mismatched provider metadata prevents publishing a reference",async()=>{
 for(const update of [{type:"rsa-2048"},{exportable:true},{allow_plaintext_backup:true},{derived:true},{deletion_allowed:true},{name:"wrong"}]){
  const server=remote(),request:typeof fetch=async(url,options)=>{const result=await server.request(url,options);if(options?.method==="GET"){const value=await result.json();return json({data:{...value.data,...update}});}return result;};
  await assert.rejects(new VaultTransitTransferKeyVault(config,request).createKey({transferId:"a",laneId:"b"}),/OPERATION_FAILED/);
 }
});
test("retirement requires authorized deletion and confirmed absence; failure keeps lane expired",async()=>{
 const server=remote(),vault=new VaultTransitTransferKeyVault(config,server.request),lane=new PrivateLaneLifecycleCoordinator(new TransferCryptoContextService(vault));
 const created=await lane.createForSend("a","b");server.retain=true;
 await assert.rejects(lane.onExpired("a"),/OPERATION_FAILED/);assert.equal(lane.get("a")?.status,"expired");
 server.retain=false;await lane.onExpired("a");assert.equal(lane.get("a")?.status,"retired");
 server.deny=true;await assert.rejects(vault.destroyKey(created.crypto.keyReference),error=>error instanceof Error&&error.message==="TRANSFER_KEY_VAULT_OPERATION_FAILED");
 const hidden:typeof fetch=async(_url,options)=>options?.method==="GET"?json({errors:[]},404):json({errors:["PRIVATE_DENIAL"]},403);
 await assert.rejects(new VaultTransitTransferKeyVault(config,hidden).destroyKey(created.crypto.keyReference),/OPERATION_FAILED/);
});
test("malformed oversized redirected and proxy responses remain private failures",async()=>{
 for(const response of [()=>json({errors:["PRIVATE_DETAIL"]},500),()=>new Response("PRIVATE_HTML",{status:404}),()=>new Response("{",{headers:{"content-type":"application/json"}}),()=>json({data:"x".repeat(65*1024)})]){
  const vault=new VaultTransitTransferKeyVault(config,async()=>response());await assert.rejects(vault.createKey({transferId:"a",laneId:"b"}),error=>error instanceof Error&&error.message==="TRANSFER_KEY_VAULT_OPERATION_FAILED");
 }
 const redirected:typeof fetch=async()=>{const response=json({});Object.defineProperty(response,"redirected",{value:true});return response;};
 await assert.rejects(new VaultTransitTransferKeyVault(config,redirected).createKey({transferId:"a",laneId:"b"}),/OPERATION_FAILED/);
});
test("deadline bounds uncooperative transport and prevents late verification requests",async()=>{
 let resolve!:(value:Response)=>void,signal:AbortSignal|undefined,calls=0,cancelled=false;
 const request:typeof fetch=async(_url,options)=>{calls++;signal=options?.signal??undefined;return new Promise<Response>(done=>{resolve=done;});};
 const pending=new VaultTransitTransferKeyVault({...config,timeoutMs:20},request).createKey({transferId:"a",laneId:"b"});
 await assert.rejects(pending,/OPERATION_FAILED/);assert.equal(signal?.aborted,true);
 resolve(new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{"content-type":"application/json"}}));
 await new Promise(done=>setImmediate(done));assert.equal(calls,1);assert.equal(cancelled,true);
});
test("deadline also cancels stalled response parsing",async()=>{
 let cancelled=false,calls=0;
 const request:typeof fetch=async()=>{calls++;return new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{"content-type":"application/json"}});};
 await assert.rejects(new VaultTransitTransferKeyVault({...config,timeoutMs:20},request).createKey({transferId:"a",laneId:"b"}),/OPERATION_FAILED/);assert.equal(calls,1);assert.equal(cancelled,true);
});
test("invalid scope never reaches the vault",async()=>{
 let calls=0;const vault=new VaultTransitTransferKeyVault(config,async()=>{calls++;throw new Error("UNEXPECTED");});
 for(const scope of [{transferId:"",laneId:"b"},{transferId:"a",laneId:"\n"}])await assert.rejects(vault.createKey(scope),/IDENTITY_REQUIRED/);assert.equal(calls,0);
});
