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
 constructor(private readonly config:{url:string;secretKey:string;wrappingKey:string;fetch?:typeof fetch}){
  const url=new URL(config.url);
  if(url.protocol!=="https:"||url.username||url.password||url.pathname!=="/"||url.search||url.hash||!config.secretKey)throw new Error("TRANSFER_KEY_VAULT_NOT_CONFIGURED");
  if(!/^[A-Za-z0-9+/]{43}=$/.test(config.wrappingKey))throw new Error("TRANSFER_KEY_WRAPPING_SECRET_INVALID");
  this.wrappingKey=Buffer.from(config.wrappingKey,"base64");
  if(this.wrappingKey.length!==32||this.wrappingKey.toString("base64")!==config.wrappingKey)throw new Error("TRANSFER_KEY_WRAPPING_SECRET_INVALID");
  this.endpoint=`${url.origin}/rest/v1/transfer_key_records`;
 }
 private scope(scope:Scope){if(!scope.transferId||!scope.laneId||scope.transferId.length>256||scope.laneId.length>256)throw new Error("TRANSFER_CRYPTO_IDENTITY_REQUIRED");}
 private reference(value:string){if(!referencePattern.test(value))throw new Error("TRANSFER_KEY_REFERENCE_INVALID");}
 private aad(reference:string,scope:Scope){return Buffer.from(JSON.stringify(["transfer-key-v1",reference,scope.transferId,scope.laneId]));}
 private async request(query:string,init:RequestInit={}){
  try{
   const response=await (this.config.fetch??fetch)(`${this.endpoint}${query}`,{...init,signal:AbortSignal.timeout(10_000),redirect:"error",credentials:"omit",cache:"no-store",headers:{apikey:this.config.secretKey,Authorization:`Bearer ${this.config.secretKey}`,"Content-Type":"application/json",...init.headers}});
   if(!response.ok)throw new Error("unavailable");
   return init.method==="POST"||init.method==="PATCH"?undefined:await response.json();
  }catch{throw new Error("TRANSFER_KEY_VAULT_UNAVAILABLE");}
 }
 async createKey(scope:Scope){
  this.scope(scope);const reference=`wrapped-key-${randomUUID()}`,nonce=randomBytes(12),key=randomBytes(32);
  try{
   const cipher=createCipheriv("aes-256-gcm",this.wrappingKey,nonce);cipher.setAAD(this.aad(reference,scope));
   const ciphertext=Buffer.concat([cipher.update(key),cipher.final()]);
   await this.request("",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({key_reference:reference,transfer_id:scope.transferId,lane_id:scope.laneId,nonce:nonce.toString("hex"),ciphertext:ciphertext.toString("hex"),auth_tag:cipher.getAuthTag().toString("hex"),retired_at:null})});
   return reference;
  }finally{key.fill(0);}
 }
 async assertKeyScope(reference:string,scope:Scope){
  this.reference(reference);this.scope(scope);
  const data=await this.request(`?${new URLSearchParams({key_reference:`eq.${reference}`,select:"key_reference,transfer_id,lane_id,nonce,ciphertext,auth_tag,retired_at",limit:"2"})}`);
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
  await this.request(`?${new URLSearchParams({key_reference:`eq.${reference}`,retired_at:"is.null"})}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({nonce:null,ciphertext:null,auth_tag:null,retired_at:new Date().toISOString()})});
 }
}
