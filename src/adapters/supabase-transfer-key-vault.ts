import {createCipheriv,createDecipheriv,randomBytes,randomUUID} from "node:crypto";
import {z} from "zod";
import type {TransferKeyVault} from "../security/transfer-crypto-context.js";

const rowSchema=z.object({key_reference:z.string(),transfer_id:z.string(),lane_id:z.string(),nonce:z.string().regex(/^[a-f0-9]{24}$/).nullable(),ciphertext:z.string().regex(/^[a-f0-9]{64}$/).nullable(),auth_tag:z.string().regex(/^[a-f0-9]{32}$/).nullable(),retired_at:z.string().nullable()});
type Scope={transferId:string;laneId:string};
const referencePattern=/^wrapped-key-[a-f0-9-]{36}$/;
// Envelope storage. The wrapping secret is server-only and must be backed up
// independently of the database. This adapter is not a managed KMS/HSM.
export class SupabaseTransferKeyVault implements TransferKeyVault {
 private readonly endpoint:string;
 private readonly wrappingKey:Buffer;
 private readonly config:{secretKey:string;fetch:typeof fetch};
 private readonly timeoutMs:number;
 constructor(config:{url:string;secretKey:string;wrappingKey:string;fetch?:typeof fetch;timeoutMs?:number}){
  const url=new URL(config.url);
  if(url.protocol!=="https:"||url.username||url.password||url.pathname!=="/"||url.search||url.hash||!config.secretKey)throw new Error("TRANSFER_KEY_VAULT_NOT_CONFIGURED");
  if(!/^[A-Za-z0-9+/]{43}=$/.test(config.wrappingKey))throw new Error("TRANSFER_KEY_WRAPPING_SECRET_INVALID");
  this.wrappingKey=Buffer.from(config.wrappingKey,"base64");
  if(this.wrappingKey.length!==32||this.wrappingKey.toString("base64")!==config.wrappingKey)throw new Error("TRANSFER_KEY_WRAPPING_SECRET_INVALID");
  this.endpoint=`${url.origin}/rest/v1/transfer_key_records`;
  this.timeoutMs=config.timeoutMs??10_000;
  if(!Number.isInteger(this.timeoutMs)||this.timeoutMs<1||this.timeoutMs>60_000)throw new Error("TRANSFER_KEY_VAULT_NOT_CONFIGURED");
  this.config={secretKey:config.secretKey,fetch:config.fetch??fetch};
 }
 private scope(scope:Scope){if(!scope.transferId||!scope.laneId||scope.transferId.length>256||scope.laneId.length>256)throw new Error("TRANSFER_CRYPTO_IDENTITY_REQUIRED");}
 private reference(value:string){if(!referencePattern.test(value))throw new Error("TRANSFER_KEY_REFERENCE_INVALID");}
 private aad(reference:string,scope:Scope){return Buffer.from(JSON.stringify(["transfer-key-v1",reference,scope.transferId,scope.laneId]));}
 private async operation<T>(run:(signal:AbortSignal)=>Promise<T>):Promise<T>{
  const controller=new AbortController();let aborted!:()=>void;
  const cancelled=new Promise<never>((_resolve,reject)=>{aborted=()=>reject(new Error("TRANSFER_KEY_VAULT_UNAVAILABLE"));controller.signal.addEventListener("abort",aborted,{once:true});});
  const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
  try{return await Promise.race([run(controller.signal),cancelled]);}
  finally{clearTimeout(timer);controller.signal.removeEventListener("abort",aborted);}
 }
 private async request(query:string,signal:AbortSignal,init:RequestInit={}){
  signal.throwIfAborted();let response:Response|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  const cancel=()=>{if(reader)void reader.cancel().catch(()=>{});else if(response?.body)void response.body.cancel().catch(()=>{});};
  signal.addEventListener("abort",cancel,{once:true});
  try{
   response=await this.config.fetch(`${this.endpoint}${query}`,{...init,signal,redirect:"error",credentials:"omit",cache:"no-store",headers:{apikey:this.config.secretKey,Authorization:`Bearer ${this.config.secretKey}`,"Content-Type":"application/json",...init.headers}});
   signal.throwIfAborted();
   if(!response.ok||response.redirected)throw new Error("unavailable");
   if(init.method==="POST"||init.method==="PATCH")return undefined;
   if(!response.body||response.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")throw new Error("unavailable");
   reader=response.body.getReader();const decoder=new TextDecoder("utf-8",{fatal:true});let json="",size=0;
   while(true){const part=await reader.read();signal.throwIfAborted();if(part.done)break;size+=part.value.byteLength;if(size>16*1024)throw new Error("unavailable");json+=decoder.decode(part.value,{stream:true});}
   return JSON.parse(json+decoder.decode());
  }catch{throw new Error("TRANSFER_KEY_VAULT_UNAVAILABLE");}
  finally{signal.removeEventListener("abort",cancel);cancel();}
 }
 async createKey(scope:Scope){
  this.scope(scope);const reference=`wrapped-key-${randomUUID()}`,nonce=randomBytes(12),key=randomBytes(32);
  try{
   const cipher=createCipheriv("aes-256-gcm",this.wrappingKey,nonce);cipher.setAAD(this.aad(reference,scope));
   const ciphertext=Buffer.concat([cipher.update(key),cipher.final()]);
   await this.operation(signal=>this.request("",signal,{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({key_reference:reference,transfer_id:scope.transferId,lane_id:scope.laneId,nonce:nonce.toString("hex"),ciphertext:ciphertext.toString("hex"),auth_tag:cipher.getAuthTag().toString("hex"),retired_at:null})}));
   return reference;
  }finally{key.fill(0);}
 }
 async assertKeyScope(reference:string,scope:Scope){
  this.reference(reference);this.scope(scope);
  scope={...scope};
  const data=await this.operation(signal=>this.read(reference,signal));
  const parsed=z.array(rowSchema).safeParse(data);
  if(!parsed.success||parsed.data.length!==1)throw new Error("TRANSFER_KEY_UNAVAILABLE");
  const row=parsed.data[0];
  if(row.key_reference!==reference||row.transfer_id!==scope.transferId||row.lane_id!==scope.laneId||row.retired_at!==null||!row.nonce||!row.ciphertext||!row.auth_tag)throw new Error("TRANSFER_KEY_UNAVAILABLE");
  let partial:Buffer|undefined,key:Buffer|undefined;
  try{
   const decipher=createDecipheriv("aes-256-gcm",this.wrappingKey,Buffer.from(row.nonce,"hex"));decipher.setAAD(this.aad(reference,scope));decipher.setAuthTag(Buffer.from(row.auth_tag,"hex"));
   partial=decipher.update(Buffer.from(row.ciphertext,"hex"));
   key=Buffer.concat([partial,decipher.final()]);
   if(key.length!==32)throw new Error("invalid");
  }catch{throw new Error("TRANSFER_KEY_UNAVAILABLE");}finally{partial?.fill(0);key?.fill(0);}
 }
 async destroyKey(reference:string){
  this.reference(reference);
  await this.operation(async signal=>{
   await this.request(`?${new URLSearchParams({key_reference:`eq.${reference}`,retired_at:"is.null"})}`,signal,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({nonce:null,ciphertext:null,auth_tag:null,retired_at:new Date().toISOString()})});
   const rows=z.array(rowSchema).safeParse(await this.read(reference,signal));
   if(!rows.success||rows.data.length!==1)throw new Error("TRANSFER_KEY_RETIREMENT_UNCONFIRMED");
   const row=rows.data[0];
   if(row.key_reference!==reference||row.retired_at===null||!Number.isFinite(Date.parse(row.retired_at))||row.nonce!==null||row.ciphertext!==null||row.auth_tag!==null)throw new Error("TRANSFER_KEY_RETIREMENT_UNCONFIRMED");
  });
 }
 private read(reference:string,signal:AbortSignal){return this.request(`?${new URLSearchParams({key_reference:`eq.${reference}`,select:"key_reference,transfer_id,lane_id,nonce,ciphertext,auth_tag,retired_at",limit:"2"})}`,signal);}
}
