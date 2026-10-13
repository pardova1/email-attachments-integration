import {z} from "zod";
import {INITIAL_MAX_TRANSFER_BYTES,DEFAULT_CHUNK_BYTES,MAX_CHUNK_BYTES} from "../domain/transfer-limits.js";
import type {ConnectionApplicationSession} from "./connection-session-view.js";
const hint=z.string().trim().min(1).max(256).refine(value=>!/[\x00-\x1f\x7f*]/.test(value));
const selection=z.string().min(1).max(256).optional();
const inputSchema=z.object({fileName:z.string().min(1).max(1024),contentType:z.string().min(1).max(255),totalBytes:z.number().int().positive().max(INITIAL_MAX_TRANSFER_BYTES),chunkBytes:z.number().int().positive().max(MAX_CHUNK_BYTES).optional(),originalSha256:z.string().regex(/^[a-fA-F0-9]{64}$/),senderExpirationConfirmed:z.literal(true),software:z.object({client:hint.optional(),platform:hint.optional(),softwareVersion:hint.optional()}).strict().optional(),connection:z.object({formId:z.uuid(),selections:z.object({country:selection,network:selection,provider:selection,client:selection,platform:selection,softwareVersion:selection}).strict()}).strict().optional()}).strict();
const createdSchema=z.object({id:z.uuid(),chunkBytes:z.number().int().positive().max(MAX_CHUNK_BYTES),uploadExpiresAt:z.iso.datetime(),uploadToken:z.string().min(1).max(8192).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),senderNotice:z.string().min(1).max(2048),recipientNotice:z.string().min(1).max(2048),uploadPartUrlTemplate:z.string().min(1).max(1024)}).strict();
export type SenderTransferInput=z.infer<typeof inputSchema>;
export type CreatedSenderTransfer=z.infer<typeof createdSchema>;
export type SenderTransferErrorCode="AUTHENTICATION_REQUIRED"|"REQUEST_REJECTED"|"ACTIVE_LICENSE_REQUIRED"|"TRANSFER_UNAVAILABLE"|"INVALID_RESPONSE"|"ACCOUNT_CHANGED"|"CLIENT_DISPOSED"|"TRANSFER_BUSY";
export class SenderTransferClientError extends Error {
 constructor(readonly code:SenderTransferErrorCode){super(code);this.name="SenderTransferClientError";}
}
// Metadata-only creation client. File hashing, chunk upload and email composition
// are separate host responsibilities. Never retries uncertain creation automatically.
export class SenderTransferClient {
 private readonly base:string;private scope:string|undefined;private generation=0;private disposed=false;private pending:AbortController|undefined;private readonly unsubscribe:()=>void;
 constructor(apiBase:string,private readonly session:ConnectionApplicationSession,private readonly request:typeof fetch=globalThis.fetch,private readonly timeoutMs=40_000){
  const url=new URL(apiBase);
  if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!url.pathname.endsWith("/v1/transfers")||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>120_000)throw new Error("INVALID_SENDER_TRANSFER_CONFIGURATION");
  this.base=url.href;this.scope=this.current();
  this.unsubscribe=session.subscribe(()=>{if(this.disposed)return;const next=this.current();if(next!==this.scope){this.scope=next;this.generation++;this.pending?.abort(new SenderTransferClientError("ACCOUNT_CHANGED"));}});
 }
 private current(){try{const id=this.session.currentCustomer();return typeof id==="string"&&id.trim()===id&&id.length>0&&id.length<=200&&!/[\x00-\x1f\x7f]/.test(id)?id:undefined;}catch{return undefined;}}
 async create(input:SenderTransferInput,external?:AbortSignal):Promise<CreatedSenderTransfer>{
  external?.throwIfAborted();if(this.disposed)throw new SenderTransferClientError("CLIENT_DISPOSED");
  const parsed=inputSchema.safeParse(input);if(!parsed.success)throw new SenderTransferClientError("REQUEST_REJECTED");
  if(!this.scope||this.current()!==this.scope)throw new SenderTransferClientError("AUTHENTICATION_REQUIRED");
  if(this.pending)throw new SenderTransferClientError("TRANSFER_BUSY");
  const expected=this.scope,version=this.generation,controller=new AbortController();this.pending=controller;
  const signal=external?AbortSignal.any([external,controller.signal]):controller.signal;
  const scoped=()=>{signal.throwIfAborted();if(this.disposed)throw new SenderTransferClientError("CLIENT_DISPOSED");if(version!==this.generation||this.current()!==expected)throw new SenderTransferClientError("ACCOUNT_CHANGED");};
  let response:Response|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  const cancelBody=()=>{if(reader)void reader.cancel().catch(()=>{});else if(response?.body)void response.body.cancel().catch(()=>{});};
  let aborted!:()=>void;
  const cancelled=new Promise<never>((_resolve,reject)=>{aborted=()=>{cancelBody();reject(signal.reason);};signal.addEventListener("abort",aborted,{once:true});});
  const timer=setTimeout(()=>controller.abort(new SenderTransferClientError("TRANSFER_UNAVAILABLE")),this.timeoutMs);
  try{return await Promise.race([(async()=>{
   let token:string;try{token=await this.session.accessToken(signal);}catch{scoped();throw new SenderTransferClientError("AUTHENTICATION_REQUIRED");}
   scoped();if(typeof token!=="string"||!token||/[\s\x00-\x1f\x7f]/.test(token))throw new SenderTransferClientError("AUTHENTICATION_REQUIRED");
   response=await this.request(this.base,{method:"POST",signal,credentials:"omit",redirect:"error",cache:"no-store",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify(parsed.data)});
   scoped();if(response.redirected)throw new SenderTransferClientError("INVALID_RESPONSE");
   if(response.status===401)throw new SenderTransferClientError("AUTHENTICATION_REQUIRED");
   if([400,415].includes(response.status))throw new SenderTransferClientError("REQUEST_REJECTED");
   if(![201,403].includes(response.status))throw new SenderTransferClientError("TRANSFER_UNAVAILABLE");
   if(!response.body||response.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")throw new SenderTransferClientError("INVALID_RESPONSE");
   reader=response.body.getReader();const decoder=new TextDecoder("utf-8",{fatal:true});let body="",bytes=0;
   while(true){const part=await reader.read();scoped();if(part.done)break;bytes+=part.value.byteLength;if(bytes>16*1024)throw new SenderTransferClientError("INVALID_RESPONSE");try{body+=decoder.decode(part.value,{stream:true});}catch{throw new SenderTransferClientError("INVALID_RESPONSE");}}
   let value:unknown;try{value=JSON.parse(body+decoder.decode());}catch{throw new SenderTransferClientError("INVALID_RESPONSE");}
   if(response.status===403){const denied=z.object({error:z.literal("ACTIVE_LICENSE_REQUIRED"),note:z.string().optional()}).strict().safeParse(value);throw new SenderTransferClientError(denied.success?"ACTIVE_LICENSE_REQUIRED":"REQUEST_REJECTED");}
   const result=createdSchema.safeParse(value);if(!result.success)throw new SenderTransferClientError("INVALID_RESPONSE");
   const created=result.data,expires=Date.parse(created.uploadExpiresAt);
   if(expires<=Date.now()||created.chunkBytes!==(parsed.data.chunkBytes??DEFAULT_CHUNK_BYTES)||created.uploadPartUrlTemplate!==`/v1/transfers/${created.id}/parts/{partNumber}`)throw new SenderTransferClientError("INVALID_RESPONSE");
   // Structural binding only: the server verifies the token signature on upload.
   try{const payload=created.uploadToken.split(".")[0].replace(/-/g,"+").replace(/_/g,"/");const claims=z.object({transferId:z.literal(created.id),scope:z.literal("upload"),exp:z.literal(Math.floor(expires/1000))}).strict().parse(JSON.parse(atob(payload)));if(claims.exp<=Math.floor(Date.now()/1000))throw new Error();}catch{throw new SenderTransferClientError("INVALID_RESPONSE");}
   scoped();return created;
  })().finally(cancelBody),cancelled]);}catch(error){scoped();if(error instanceof SenderTransferClientError)throw error;throw new SenderTransferClientError("TRANSFER_UNAVAILABLE");}
  finally{clearTimeout(timer);signal.removeEventListener("abort",aborted);cancelBody();if(this.pending===controller)this.pending=undefined;}
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.generation++;this.pending?.abort(new SenderTransferClientError("CLIENT_DISPOSED"));this.unsubscribe();}
}
