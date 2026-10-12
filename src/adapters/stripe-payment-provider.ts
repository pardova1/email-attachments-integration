import {createHash} from "node:crypto";
import {z} from "zod";
import {planForAmount,priceForPlan} from "../billing/annual-license.js";
import type {CheckoutRequest,PaymentConfirmation,PaymentProvider} from "../billing/payment-provider.js";

export const STRIPE_API_VERSION="2025-02-24.acacia";
const marker="email-bridge-license-v1",sessionId=/^cs_(test|live)_[A-Za-z0-9]+$/;
const identity=z.string().min(1).max(200).refine(value=>value.trim()===value&&!/[\x00-\x1f\x7f]/.test(value));
const metadata=z.object({bridge_product:z.literal(marker),user_id:identity,plan:z.enum(["individual","business"])});
const session=z.object({id:z.string().regex(sessionId),object:z.literal("checkout.session"),livemode:z.boolean(),mode:z.literal("payment"),currency:z.literal("usd"),amount_total:z.number().int(),client_reference_id:identity,metadata,status:z.string(),payment_status:z.string()});
const intent=z.object({id:z.string().regex(/^pi_[A-Za-z0-9]+$/),object:z.literal("payment_intent"),livemode:z.boolean(),currency:z.literal("usd"),amount:z.number().int(),amount_received:z.number().int(),status:z.literal("succeeded"),metadata,latest_charge:z.object({id:z.string().regex(/^ch_[A-Za-z0-9]+$/),object:z.literal("charge"),livemode:z.boolean(),payment_intent:z.string(),currency:z.literal("usd"),amount:z.number().int(),paid:z.literal(true),captured:z.literal(true),status:z.literal("succeeded"),refunded:z.boolean(),amount_refunded:z.number().int().nonnegative(),disputed:z.boolean(),created:z.number().int().positive()})});

export class StripePaymentProvider implements PaymentProvider {
 private readonly key:string;private readonly live:boolean;private readonly successUrl:string;private readonly cancelUrl:string;private readonly timeoutMs:number;
 constructor(config:{secretKey:string;successUrl:string;cancelUrl:string;timeoutMs?:number},private readonly transport:typeof fetch=fetch){
  if(!/^sk_(test|live)_[A-Za-z0-9]+$/.test(config.secretKey))throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED");
  const checked=(value:string)=>{try{const url=new URL(value);if(url.protocol!=="https:"||url.username||url.password||url.hash)throw new Error();return value;}catch{throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED");}};
  this.key=config.secretKey;this.live=config.secretKey.startsWith("sk_live_");this.successUrl=checked(config.successUrl);this.cancelUrl=checked(config.cancelUrl);this.timeoutMs=config.timeoutMs??10_000;
  if(!Number.isInteger(this.timeoutMs)||this.timeoutMs<1||this.timeoutMs>60_000)throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED");
 }
 private async request(path:string,method:"POST"|"GET",body?:URLSearchParams,idempotencyKey?:string):Promise<unknown>{
  const controller=new AbortController();let aborted!:()=>void,response:Response|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  const cancel=()=>{if(reader)void reader.cancel().catch(()=>{});else if(response?.body)void response.body.cancel().catch(()=>{});};
  const cancelled=new Promise<never>((_resolve,reject)=>{aborted=()=>{cancel();reject(new Error("PAYMENT_PROVIDER_UNAVAILABLE"));};controller.signal.addEventListener("abort",aborted,{once:true});});
  const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
  try{return await Promise.race([(async()=>{
   response=await this.transport(`https://api.stripe.com/v1/${path}`,{method,signal:controller.signal,redirect:"error",credentials:"omit",cache:"no-store",headers:{Authorization:`Bearer ${this.key}`,"Stripe-Version":STRIPE_API_VERSION,...(body?{"Content-Type":"application/x-www-form-urlencoded"}:{}),...(idempotencyKey?{"Idempotency-Key":idempotencyKey}:{})},...(body?{body:body.toString()}:{})});
   controller.signal.throwIfAborted();
   if(!response.ok||response.redirected||!response.body||response.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")throw new Error();
   reader=response.body.getReader();const decoder=new TextDecoder("utf-8",{fatal:true});let text="",size=0;
   while(true){const part=await reader.read();controller.signal.throwIfAborted();if(part.done)break;size+=part.value.byteLength;if(size>128*1024)throw new Error();text+=decoder.decode(part.value,{stream:true});}
   return JSON.parse(text+decoder.decode());
  })().finally(cancel),cancelled]);}catch{throw new Error("PAYMENT_PROVIDER_UNAVAILABLE");}
  finally{clearTimeout(timer);controller.signal.removeEventListener("abort",aborted);cancel();}
 }
 async createCheckout(request:CheckoutRequest){
  const parsed=z.object({userId:identity,amountUsdCents:z.union([z.literal(400),z.literal(1000)]),product:z.literal("annual-license"),plan:z.enum(["individual","business"]).optional(),requestId:z.uuid()}).strict().safeParse(request);
  if(!parsed.success)throw new Error("INVALID_CHECKOUT_REQUEST");
  const input=parsed.data,plan=input.plan??planForAmount(input.amountUsdCents);
  if(priceForPlan(plan)!==input.amountUsdCents)throw new Error("INVALID_CHECKOUT_REQUEST");
  const body=new URLSearchParams({mode:"payment",success_url:this.successUrl,cancel_url:this.cancelUrl,client_reference_id:input.userId,"payment_method_types[0]":"card","locale":"auto","line_items[0][quantity]":"1","line_items[0][price_data][currency]":"usd","line_items[0][price_data][unit_amount]":String(input.amountUsdCents),"line_items[0][price_data][product_data][name]":`${plan==="business"?"Business":"Individual"} annual license`});
  for(const [key,value] of Object.entries({bridge_product:marker,user_id:input.userId,plan})){body.set(`metadata[${key}]`,value);body.set(`payment_intent_data[metadata][${key}]`,value);}
  const idempotencyKey=createHash("sha256").update(JSON.stringify([marker,input.userId,input.requestId])).digest("hex");
  const result=session.extend({url:z.string().url()}).safeParse(await this.request("checkout/sessions","POST",body,idempotencyKey));
  if(!result.success)throw new Error("PAYMENT_PROVIDER_RESPONSE_INVALID");
  const s=result.data,url=new URL(s.url);
  if(url.origin!=="https://checkout.stripe.com"||url.username||url.password||s.livemode!==this.live||!s.id.startsWith(`cs_${this.live?"live":"test"}_`)||s.client_reference_id!==input.userId||s.metadata.user_id!==input.userId||s.metadata.plan!==plan||s.amount_total!==input.amountUsdCents||s.status!=="open"||s.payment_status!=="unpaid")throw new Error("PAYMENT_PROVIDER_RESPONSE_INVALID");
  return {checkoutId:s.id,providerReference:`stripe-checkout:${s.id}`,checkoutUrl:s.url};
 }
 async verifyPayment(reference:string):Promise<PaymentConfirmation>{
  const id=reference.startsWith("stripe-checkout:")?reference.slice("stripe-checkout:".length):"";
  if(!sessionId.test(id))throw new Error("INVALID_PAYMENT_REFERENCE");
  const result=session.extend({payment_intent:intent}).safeParse(await this.request(`checkout/sessions/${id}?expand%5B%5D=payment_intent.latest_charge`,"GET"));
  if(!result.success)throw new Error("PAYMENT_NOT_COMPLETED");
  const s=result.data,p=s.payment_intent,c=p.latest_charge,amount=priceForPlan(s.metadata.plan);
  if(s.id!==id||!s.id.startsWith(`cs_${this.live?"live":"test"}_`)||s.livemode!==this.live||p.livemode!==this.live||c.livemode!==this.live||s.status!=="complete"||s.payment_status!=="paid"||s.client_reference_id!==s.metadata.user_id||JSON.stringify(s.metadata)!==JSON.stringify(p.metadata)||s.amount_total!==amount||p.amount!==amount||p.amount_received!==amount||c.amount!==amount||c.payment_intent!==p.id||c.disputed)throw new Error("PAYMENT_NOT_COMPLETED");
  const paidAt=new Date(c.created*1000);
  if(!Number.isFinite(paidAt.getTime())||paidAt.getTime()>Date.now()+60_000)throw new Error("PAYMENT_NOT_COMPLETED");
  return {userId:s.metadata.user_id,amountUsdCents:amount,paidAt,providerReference:reference,status:c.refunded||c.amount_refunded>0?"refunded":"paid"};
 }
}
