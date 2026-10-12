import {createHash} from "node:crypto";
import {z} from "zod";
import type {RecoveryEmail,RecoveryEmailPort,RecoveryEmailSendContext} from "../email/recovery-email-port.js";
const mailbox=z.email().max(320);
const emailSchema=z.object({recipient:mailbox,subject:z.string().min(1).max(998).refine(value=>!/[\x00-\x1f\x7f]/.test(value)),text:z.string().min(1).max(100_000)}).strict();

// Server-only notification adapter. Large-file bytes stay on the transfer path.
// Provider acceptance is not a delivery receipt from the recipient's mailbox.
export class ResendCustomerEmailAdapter implements RecoveryEmailPort {
 constructor(private readonly apiKey:string,private readonly from:string,private readonly request:typeof fetch=globalThis.fetch,private readonly timeoutMs=10_000){
  if(typeof apiKey!=="string"||!apiKey.startsWith("re_")||apiKey.length<8||apiKey.length>512||/[\s\x00-\x1f\x7f]/.test(apiKey)||!mailbox.safeParse(from).success||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60_000)throw new Error("INVALID_CUSTOMER_EMAIL_CONFIGURATION");
 }
 async send(message:RecoveryEmail,context?:RecoveryEmailSendContext):Promise<void>{
  const parsed=emailSchema.safeParse(message);
  if(!parsed.success)throw new Error("INVALID_CUSTOMER_EMAIL");
  if(!context||typeof context.idempotencyKey!=="string"||!context.idempotencyKey.trim()||context.idempotencyKey.length>4096||/[\x00-\x1f\x7f]/.test(context.idempotencyKey))throw new Error("CUSTOMER_EMAIL_IDEMPOTENCY_REQUIRED");
  if(context.signal?.aborted)throw new Error("CUSTOMER_EMAIL_SEND_CANCELLED");
  const body=JSON.stringify({from:this.from,to:[parsed.data.recipient],subject:parsed.data.subject,text:parsed.data.text});
  const key=`bridge:${createHash("sha256").update(context.idempotencyKey).digest("hex")}`;
  const controller=new AbortController(),signal=context.signal?AbortSignal.any([context.signal,controller.signal]):controller.signal;
  let response:Response|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined,aborted!:()=>void;
  const cancelled=new Promise<never>((_resolve,reject)=>{aborted=()=>reject(new Error(context.signal?.aborted?"CUSTOMER_EMAIL_SEND_CANCELLED":"CUSTOMER_EMAIL_TIMEOUT"));signal.addEventListener("abort",aborted,{once:true});});
  const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
  try{
   await Promise.race([(async()=>{
    response=await this.request("https://api.resend.com/emails",{method:"POST",headers:{authorization:`Bearer ${this.apiKey}`,"content-type":"application/json","Idempotency-Key":key},body,signal,redirect:"error",credentials:"omit",cache:"no-store"});
    if(signal.aborted){if(response.body)void response.body.cancel().catch(()=>{});signal.throwIfAborted();}
    if(!response.ok||response.redirected||response.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json"||!response.body)throw new Error("CUSTOMER_EMAIL_SEND_FAILED");
    reader=response.body.getReader();const decoder=new TextDecoder("utf-8",{fatal:true});let bytes=0,json="";
    while(true){const part=await Promise.race([reader.read(),cancelled]);signal.throwIfAborted();if(part.done)break;bytes+=part.value.byteLength;if(bytes>64*1024)throw new Error("CUSTOMER_EMAIL_SEND_FAILED");json+=decoder.decode(part.value,{stream:true});}
    json+=decoder.decode();const accepted=JSON.parse(json) as {id?:unknown};
    if(!accepted||typeof accepted.id!=="string"||!accepted.id.trim()||accepted.id.length>256||/[\x00-\x1f\x7f]/.test(accepted.id))throw new Error("CUSTOMER_EMAIL_SEND_FAILED");
   })(),cancelled]);
  }catch{
   throw new Error(context.signal?.aborted?"CUSTOMER_EMAIL_SEND_CANCELLED":signal.aborted?"CUSTOMER_EMAIL_TIMEOUT":"CUSTOMER_EMAIL_SEND_FAILED");
  }finally{
   clearTimeout(timer);signal.removeEventListener("abort",aborted);
   if(reader)void reader.cancel().catch(()=>{});else if(response?.body)void response.body.cancel().catch(()=>{});
  }
 }
}
