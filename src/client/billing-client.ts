import {z} from "zod";
import {priceForPlan} from "../billing/annual-license.js";
const plan=z.enum(["individual","business"]);
const reference=z.string().regex(/^stripe-checkout:cs_(test|live)_[A-Za-z0-9]+$/);
const checkoutInput=z.object({plan,requestId:z.uuid()}).strict();
const checkoutResult=z.object({checkoutId:z.string().regex(/^cs_(test|live)_[A-Za-z0-9]+$/),providerReference:reference,checkoutUrl:z.string().url()}).strict();
const licenseResult=z.object({plan,startsAt:z.iso.datetime(),expiresAt:z.iso.datetime(),amountPaidUsdCents:z.number().int(),status:z.enum(["active","expired"])}).strict();
const statusResult=z.object({checkedAt:z.iso.datetime(),licenses:z.array(licenseResult.extend({active:z.boolean()}).strict()).max(2)}).strict();
export type BillingCheckout=z.infer<typeof checkoutResult>;
export type BillingLicense=z.infer<typeof licenseResult>;
export type BillingLicenseStatus=z.infer<typeof statusResult>;
export type BillingErrorCode="AUTHENTICATION_REQUIRED"|"REQUEST_REJECTED"|"PAYMENT_REJECTED"|"BILLING_BUSY"|"BILLING_UNAVAILABLE"|"INVALID_RESPONSE";
export class BillingClientError extends Error {
 constructor(readonly code:BillingErrorCode){super(code);this.name="BillingClientError";}
}
// Tokens are supplied by the host session for each request and never persisted.
export class BillingClient {
 private readonly base:string;
 constructor(apiBase:string,private readonly accessToken:(signal:AbortSignal)=>Promise<string>,private readonly request:typeof fetch=globalThis.fetch,private readonly timeoutMs=40_000){
  const url=new URL(apiBase);
  if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!url.pathname.endsWith("/v1/billing")||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>120_000)throw new Error("INVALID_BILLING_CLIENT_CONFIGURATION");
  this.base=url.href;
 }
 async checkout(input:z.infer<typeof checkoutInput>,signal?:AbortSignal):Promise<BillingCheckout>{
  const parsed=checkoutInput.safeParse(input);if(!parsed.success)throw new BillingClientError("REQUEST_REJECTED");
  const result=checkoutResult.safeParse(await this.send("checkout",parsed.data,201,signal));
  if(!result.success)throw new BillingClientError("INVALID_RESPONSE");
  const value=result.data,url=new URL(value.checkoutUrl);
  if(value.providerReference!==`stripe-checkout:${value.checkoutId}`||url.origin!=="https://checkout.stripe.com"||url.username||url.password||url.hash)throw new BillingClientError("INVALID_RESPONSE");
  return value;
 }
 async confirm(providerReference:string,signal?:AbortSignal):Promise<BillingLicense>{
  if(!reference.safeParse(providerReference).success)throw new BillingClientError("REQUEST_REJECTED");
  const parsed=licenseResult.safeParse(await this.send("confirm-payment",{providerReference},200,signal));
  if(!parsed.success||parsed.data.amountPaidUsdCents!==priceForPlan(parsed.data.plan)||Date.parse(parsed.data.expiresAt)<=Date.parse(parsed.data.startsAt))throw new BillingClientError("INVALID_RESPONSE");
  return parsed.data;
 }
 async licenseStatus(signal?:AbortSignal):Promise<BillingLicenseStatus>{
  const parsed=statusResult.safeParse(await this.send("license-status",{},200,signal));
  if(!parsed.success)throw new BillingClientError("INVALID_RESPONSE");
  const value=parsed.data,time=Date.parse(value.checkedAt),plans=new Set<string>();
  if(time>Date.now()+60_000||time<Date.now()-300_000)throw new BillingClientError("INVALID_RESPONSE");
  for(const item of value.licenses){
   const start=Date.parse(item.startsAt),end=Date.parse(item.expiresAt);
   if(plans.has(item.plan)||item.amountPaidUsdCents!==priceForPlan(item.plan)||end<=start||item.active!==(item.status==="active"&&start<=time&&time<end))throw new BillingClientError("INVALID_RESPONSE");
   plans.add(item.plan);
  }
  return value;
 }
 private async send(path:string,input:unknown,success:number,external?:AbortSignal):Promise<unknown>{
  external?.throwIfAborted();const controller=new AbortController(),signal=external?AbortSignal.any([external,controller.signal]):controller.signal;
  let response:Response|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  const cancelBody=()=>{if(reader)void reader.cancel().catch(()=>{});else if(response?.body)void response.body.cancel().catch(()=>{});};
  let aborted!:()=>void;
  const cancelled=new Promise<never>((_resolve,reject)=>{aborted=()=>{cancelBody();reject(signal.reason);};signal.addEventListener("abort",aborted,{once:true});});
  const timer=setTimeout(()=>controller.abort(new BillingClientError("BILLING_UNAVAILABLE")),this.timeoutMs);
  try{return await Promise.race([(async()=>{
   let token:string;try{token=await this.accessToken(signal);}catch{signal.throwIfAborted();throw new BillingClientError("AUTHENTICATION_REQUIRED");}
   signal.throwIfAborted();if(typeof token!=="string"||!token||/[\s\x00-\x1f\x7f]/.test(token))throw new BillingClientError("AUTHENTICATION_REQUIRED");
   response=await this.request(`${this.base}/${path}`,{method:"POST",signal,redirect:"error",credentials:"omit",cache:"no-store",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify(input)});
   signal.throwIfAborted();if(response.redirected)throw new BillingClientError("INVALID_RESPONSE");
   if(response.status===401)throw new BillingClientError("AUTHENTICATION_REQUIRED");
   if([400,403,415].includes(response.status))throw new BillingClientError("REQUEST_REJECTED");
   if(response.status===409)throw new BillingClientError("PAYMENT_REJECTED");
   if(response.status!==success&&response.status!==503)throw new BillingClientError("BILLING_UNAVAILABLE");
   if(!response.body||response.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")throw new BillingClientError("INVALID_RESPONSE");
   reader=response.body.getReader();const decoder=new TextDecoder("utf-8",{fatal:true});let body="",size=0;
   while(true){const part=await reader.read();signal.throwIfAborted();if(part.done)break;size+=part.value.byteLength;if(size>16*1024)throw new BillingClientError("INVALID_RESPONSE");try{body+=decoder.decode(part.value,{stream:true});}catch{throw new BillingClientError("INVALID_RESPONSE");}}
   let value:unknown;try{value=JSON.parse(body+decoder.decode());}catch{throw new BillingClientError("INVALID_RESPONSE");}
   if(response.status===503)throw new BillingClientError(z.object({error:z.literal("BILLING_BUSY")}).strict().safeParse(value).success?"BILLING_BUSY":"BILLING_UNAVAILABLE");
   return value;
  })().finally(cancelBody),cancelled]);}catch(error){signal.throwIfAborted();if(error instanceof BillingClientError)throw error;throw new BillingClientError("BILLING_UNAVAILABLE");}
  finally{clearTimeout(timer);signal.removeEventListener("abort",aborted);cancelBody();}
 }
}
