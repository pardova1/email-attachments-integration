import {z} from "zod";
const fields=["country","network","provider","client","platform","softwareVersion"] as const;
const field=z.enum(fields);
const check=z.enum(["application-installation","dns-tls","email-delivery","attachment-integration","upload","recipient-download","file-integrity"]);
const text=z.string().min(1);
const details=z.object({country:text,network:text,provider:text,client:text,platform:text,softwareVersion:text});
const resultSchema=z.discriminatedUnion("status",[
 z.object({status:z.literal("customer-input-required"),retryRequired:z.literal(true),language:text,direction:z.enum(["ltr","rtl"]),languageOptions:z.array(z.object({tag:text,label:text})).min(1),form:z.object({id:z.uuid(),message:text,expiresAt:text,fields:z.array(z.object({key:field,label:text,options:z.array(z.object({id:text,label:text,value:text,requires:z.partialRecord(field,text).optional()})).min(1)})).min(1)})}),
 z.object({status:z.literal("assessed"),retryRequired:z.boolean(),language:text,discoveryReference:text,environmentSource:z.enum(["automatic","customer-selection"]),validation:z.object({missingTools:z.array(check),assessment:z.object({environment:details,status:z.enum(["verified","unverified","not-ready","restricted"]),requiredChecks:z.array(check),reasons:z.array(text),checkedAt:text.optional(),expiresAt:text.optional()})})}),
 z.object({status:z.literal("pending-internal-retry"),retryRequired:z.literal(true),language:text,reason:text})
]);
const software=z.object({client:z.string().trim().min(1).max(256).optional(),platform:z.string().trim().min(1).max(256).optional(),softwareVersion:z.string().trim().min(1).max(256).optional()}).strict();
const checkInput=z.object({language:z.string().min(1).max(100).optional(),software:software.optional()}).strict();
const selectionInput=z.object({formId:z.uuid(),language:z.string().min(1).max(100).optional(),selections:z.partialRecord(field,z.string().min(1).max(256))}).strict();
export type ConnectionClientResult=z.infer<typeof resultSchema>;
export type ConnectionCheckInput=z.infer<typeof checkInput>;
export type ConnectionSelectionInput=z.infer<typeof selectionInput>;
export type ConnectionClientErrorCode="AUTHENTICATION_REQUIRED"|"REQUEST_REJECTED"|"CHECK_UNAVAILABLE"|"INVALID_RESPONSE";
export class ConnectionClientError extends Error {
 constructor(readonly code:ConnectionClientErrorCode){super(code);this.name="ConnectionClientError";}
}

// Browser/native-client adapter: get a current token for each request. Never
// persist it, send cookies, follow redirects, or accept user-selected API URLs.
export class ConnectionCheckClient {
 private readonly base:string;
 constructor(apiBase:string,private readonly accessToken:(signal:AbortSignal)=>Promise<string>,private readonly request:typeof fetch=globalThis.fetch,private readonly timeoutMs=40_000,private readonly clock=()=>new Date()) {
  const url=new URL(apiBase);
  if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!url.pathname.endsWith("/v1/connection")||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>120_000)throw new Error("INVALID_CONNECTION_CLIENT_CONFIGURATION");
  this.base=url.href;
 }
 async check(input:ConnectionCheckInput={},signal?:AbortSignal){
  const parsed=checkInput.safeParse(input);if(!parsed.success)throw new ConnectionClientError("REQUEST_REJECTED");
  return this.send("check",parsed.data,signal);
 }
 async submit(input:ConnectionSelectionInput,signal?:AbortSignal){
  const parsed=selectionInput.safeParse(input);if(!parsed.success)throw new ConnectionClientError("REQUEST_REJECTED");
  return this.send("selections",parsed.data,signal);
 }
 private async send(path:string,input:unknown,external?:AbortSignal):Promise<ConnectionClientResult>{
  external?.throwIfAborted();
  const controller=new AbortController(),signal=external?AbortSignal.any([external,controller.signal]):controller.signal;
  let responseBody:ReadableStream<Uint8Array>|undefined;
  let aborted!:()=>void,reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  const cancelled=new Promise<never>((_resolve,reject)=>{aborted=()=>reject(signal.reason);signal.addEventListener("abort",aborted,{once:true});});
  const timer=setTimeout(()=>controller.abort(new ConnectionClientError("CHECK_UNAVAILABLE")),this.timeoutMs);
  try{
   return await Promise.race([(async()=>{
    let token:string;
    try{token=await this.accessToken(signal);}catch{signal.throwIfAborted();throw new ConnectionClientError("AUTHENTICATION_REQUIRED");}
    signal.throwIfAborted();
    if(typeof token!=="string"||!token.trim()||/[\s\x00-\x1f\x7f]/.test(token))throw new ConnectionClientError("AUTHENTICATION_REQUIRED");
    const response=await this.request(`${this.base}/${path}`,{method:"POST",redirect:"error",credentials:"omit",cache:"no-store",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify(input),signal});
    responseBody=response.body??undefined;
    signal.throwIfAborted();
    if(response.status===401)throw new ConnectionClientError("AUTHENTICATION_REQUIRED");
    if([400,403,415].includes(response.status))throw new ConnectionClientError("REQUEST_REJECTED");
    if(![200,503].includes(response.status))throw new ConnectionClientError("CHECK_UNAVAILABLE");
    if(response.redirected||response.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json"||!response.body)throw new ConnectionClientError("INVALID_RESPONSE");
    reader=response.body.getReader();const decoder=new TextDecoder("utf-8",{fatal:true});let bytes=0,body="";
    while(true){
     const part=await Promise.race([reader.read(),cancelled]);signal.throwIfAborted();if(part.done)break;
     bytes+=part.value.byteLength;if(bytes>128*1024)throw new ConnectionClientError("INVALID_RESPONSE");
     body+=decoder.decode(part.value,{stream:true});
    }
    body+=decoder.decode();
    let raw:unknown;try{raw=JSON.parse(body);}catch{throw new ConnectionClientError("INVALID_RESPONSE");}
    const parsed=resultSchema.safeParse(raw);if(!parsed.success)throw new ConnectionClientError(response.status===503?"CHECK_UNAVAILABLE":"INVALID_RESPONSE");
    const result=parsed.data,now=this.clock().getTime();
    if(!Number.isFinite(now))throw new ConnectionClientError("INVALID_RESPONSE");
    if(response.status===503&&result.status!=="pending-internal-retry")throw new ConnectionClientError("INVALID_RESPONSE");
    if(result.status==="customer-input-required"){
     if(!Number.isFinite(Date.parse(result.form.expiresAt))||Date.parse(result.form.expiresAt)<=now)throw new ConnectionClientError("INVALID_RESPONSE");
     validateFallbackChoices(result.form);
    }
    if(result.status==="assessed"){
     const assessment=result.validation.assessment,verified=assessment.status==="verified";
     if(result.retryRequired===verified)throw new ConnectionClientError("INVALID_RESPONSE");
     if(verified&&(!assessment.checkedAt||!assessment.expiresAt||!Number.isFinite(Date.parse(assessment.checkedAt))||Date.parse(assessment.checkedAt)>now||!Number.isFinite(Date.parse(assessment.expiresAt))||Date.parse(assessment.expiresAt)<=now||assessment.requiredChecks.length||assessment.reasons.length||result.validation.missingTools.length))throw new ConnectionClientError("INVALID_RESPONSE");
    }
    return result;
   })(),cancelled]);
  }catch(error){signal.throwIfAborted();if(error instanceof ConnectionClientError)throw error;throw new ConnectionClientError("CHECK_UNAVAILABLE");}
  finally{clearTimeout(timer);signal.removeEventListener("abort",aborted);if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{/* Pending cancelled read. */}}else if(responseBody)void responseBody.cancel().catch(()=>{});}
 }
}

// Dependents may refer only to earlier fields actually offered by this form.
// Requirements already satisfied by discovery are removed by the server.
function validateFallbackChoices(form:Extract<ConnectionClientResult,{status:"customer-input-required"}>["form"]){
 const seen=new Map<string,Set<string>>();let previous=-1;
 for(const item of form.fields){
  const index=fields.indexOf(item.key);
  if(index<=previous)throw new ConnectionClientError("INVALID_RESPONSE");
  previous=index;const ids=new Set<string>(),values=new Set<string>();
  for(const choice of item.options){
   if(ids.has(choice.id)||item.key==="country"&&!/^[A-Z]{2}$/.test(choice.value))throw new ConnectionClientError("INVALID_RESPONSE");
   ids.add(choice.id);values.add(choice.value);
   for(const [dependency,value] of Object.entries(choice.requires??{})){
    if(!seen.get(dependency)?.has(value))throw new ConnectionClientError("INVALID_RESPONSE");
   }
  }
  seen.set(item.key,values);
 }
}
