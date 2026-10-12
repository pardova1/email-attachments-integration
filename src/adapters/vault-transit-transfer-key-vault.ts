import {createHash,randomUUID} from "node:crypto";
import type {TransferKeyVault} from "../security/transfer-crypto-context.js";

export interface VaultTransitConfiguration {address:string;token:string;mount?:string;namespace?:string;timeoutMs?:number;}
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
const path=(value:string)=>value.length<=512&&value.split("/").every(segment=>/^[A-Za-z0-9_-]+$/.test(segment));
const failure=()=>new Error("TRANSFER_KEY_VAULT_OPERATION_FAILED");

// Server-only key lifecycle adapter. Keys stay in Vault; no file bytes, key
// material, tokens or customer identities are returned in application metadata.
export class VaultTransitTransferKeyVault implements TransferKeyVault {
 private readonly address:string;
 private readonly token:string;
 private readonly mount:string;
 private readonly namespace:string;
 private readonly timeoutMs:number;
 private readonly binding:string;
 constructor(config:VaultTransitConfiguration,private readonly request:typeof fetch=globalThis.fetch){
  try{
   const url=new URL(config.address);
   if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||url.pathname!=="/"||typeof config.token!=="string"||!config.token||config.token.length>8192||/[\s\x00-\x1f\x7f]/.test(config.token))throw failure();
   this.address=url.origin;this.token=config.token;this.mount=config.mount??"transit";this.namespace=config.namespace??"";this.timeoutMs=config.timeoutMs??10_000;
   if(!path(this.mount)||(this.namespace&&!path(this.namespace))||!Number.isInteger(this.timeoutMs)||this.timeoutMs<1||this.timeoutMs>60_000)throw failure();
   this.binding=hash(JSON.stringify([this.address,this.mount,this.namespace]));
  }catch{throw new Error("INVALID_TRANSFER_KEY_VAULT_CONFIGURATION");}
 }
 async createKey(scope:{transferId:string;laneId:string}):Promise<string>{
  if(!scope||![scope.transferId,scope.laneId].every(value=>typeof value==="string"&&value.trim().length>0&&value.length<=4096&&!/[\x00-\x1f\x7f]/.test(value)))throw new Error("TRANSFER_CRYPTO_IDENTITY_REQUIRED");
  // Fresh allocation prevents recreating a retired reference when an identity
  // is reused. Failed/uncertain creation is never retried under a new name here.
  const name=hash(JSON.stringify([scope.transferId,scope.laneId,randomUUID()]));
  await this.operation(async signal=>{
   await this.call(`keys/bridge-${name}`,"POST",signal,{type:"aes256-gcm96",derived:false,exportable:false,allow_plaintext_backup:false});
   const metadata=await this.call(`keys/bridge-${name}`,"GET",signal);
   this.requireMetadata(metadata,name,false);
  });
  return `vault-transit:v1:${this.binding}:${name}`;
 }
 async destroyKey(reference:string):Promise<void>{
  const match=typeof reference==="string"?reference.match(/^vault-transit:v1:([a-f0-9]{64}):([a-f0-9]{64})$/):null;
  if(!match||match[1]!==this.binding)throw new Error("TRANSFER_KEY_VAULT_REFERENCE_REJECTED");
  const name=match[2],key=`keys/bridge-${name}`;
  await this.operation(async signal=>{
   const metadata=await this.call(key,"GET",signal,undefined,true);
   if(metadata!==null){
    this.requireMetadata(metadata,name);
    await this.call(`${key}/config`,"POST",signal,{deletion_allowed:true});
   }
   // Even an empty-errors 404 is not sufficient proof: require an authorized
   // successful delete, including when a previous worker already retired it.
   await this.call(key,"DELETE",signal);
   if(await this.call(key,"GET",signal,undefined,true)!==null)throw failure();
  });
 }
 private requireMetadata(value:unknown,name:string,deletionAllowed?:boolean){
  const data=(value as {data?:Record<string,unknown>}|null)?.data;
  if(!data||data.name!==`bridge-${name}`||data.type!=="aes256-gcm96"||data.derived!==false||data.exportable!==false||data.allow_plaintext_backup!==false||typeof data.deletion_allowed!=="boolean"||(deletionAllowed!==undefined&&data.deletion_allowed!==deletionAllowed))throw failure();
 }
 private async operation(run:(signal:AbortSignal)=>Promise<void>){
  const controller=new AbortController();let aborted!:()=>void;
  const cancelled=new Promise<never>((_resolve,reject)=>{aborted=()=>reject(failure());controller.signal.addEventListener("abort",aborted,{once:true});});
  const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
  try{await Promise.race([run(controller.signal),cancelled]);}
  catch{throw failure();}
  finally{clearTimeout(timer);controller.signal.removeEventListener("abort",aborted);}
 }
 private async call(route:string,method:string,signal:AbortSignal,body?:object,allowMissing=false):Promise<unknown>{
  signal.throwIfAborted();let response:Response|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  const cancel=()=>{if(reader)void reader.cancel().catch(()=>{});else if(response?.body)void response.body.cancel().catch(()=>{});};
  signal.addEventListener("abort",cancel,{once:true});
  try{
   response=await this.request(`${this.address}/v1/${this.mount}/${route}`,{method,headers:{"X-Vault-Token":this.token,...(this.namespace?{"X-Vault-Namespace":this.namespace}:{}),...(body?{"content-type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{}),signal,redirect:"error",credentials:"omit",cache:"no-store"});
   signal.throwIfAborted();
   if(response.redirected)throw failure();
   if(response.status===204&&method!=="GET")return undefined;
   if(response.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json"||!response.body)throw failure();
   reader=response.body.getReader();const decoder=new TextDecoder("utf-8",{fatal:true});let json="",size=0;
   while(true){const part=await reader.read();signal.throwIfAborted();if(part.done)break;size+=part.value.byteLength;if(size>64*1024)throw failure();json+=decoder.decode(part.value,{stream:true});}
   json+=decoder.decode();const parsed=JSON.parse(json);
   // Interpret only the expected empty-errors form as a possible absence.
   // destroyKey still requires successful authorized DELETE before retirement.
   if(allowMissing&&method==="GET"&&response.status===404&&Array.isArray(parsed?.errors)&&parsed.errors.length===0)return null;
   if(response.status!==200||!parsed||typeof parsed!=="object"||Array.isArray(parsed)||(parsed.errors!==undefined&&(!Array.isArray(parsed.errors)||parsed.errors.length>0)))throw failure();
   return parsed;
  }finally{signal.removeEventListener("abort",cancel);cancel();}
 }
}
