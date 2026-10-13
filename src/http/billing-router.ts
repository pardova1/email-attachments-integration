import {Router,type RequestHandler} from "express";
import {z} from "zod";
import {priceForPlan} from "../billing/annual-license.js";
import type {PaymentProvider} from "../billing/payment-provider.js";
import type {EntitlementService} from "../billing/entitlement-service.js";
import type {ConnectionCheckRouterOptions} from "./connection-check-router.js";
import {connectionConcurrency,type ConnectionConcurrency} from "../config/connection-concurrency.js";

export interface BillingRouterOptions {
 authenticator:ConnectionCheckRouterOptions["authenticator"];
 payments:PaymentProvider;
 entitlements:Pick<EntitlementService,"activateFromPayment">&Partial<Pick<EntitlementService,"licenseStatus">>;
 allowedOrigins?:string[];
 timeoutMs?:number;
 concurrency?:ConnectionConcurrency;
}
const checkout=z.object({plan:z.enum(["individual","business"]),requestId:z.uuid()}).strict();
const confirmation=z.object({providerReference:z.string().regex(/^stripe-checkout:cs_(test|live)_[A-Za-z0-9]+$/)}).strict();
const statusInput=z.object({}).strict();
export function billingOriginsFromEnvironment(env:NodeJS.ProcessEnv=process.env){return env.BILLING_ALLOWED_ORIGINS===undefined?[]:env.BILLING_ALLOWED_ORIGINS.split(",").map(value=>value.trim());}

// Identity comes exclusively from Bearer authentication. Provider verification
// must complete before the customer's shared durable payment ledger is used.
export function createBillingRouter(options:BillingRouterOptions){
 const router=Router(),timeout=options.timeoutMs??30_000;
 if(!Number.isInteger(timeout)||timeout<1||timeout>120_000)throw new Error("INVALID_BILLING_TIMEOUT");
 const origins=new Set((options.allowedOrigins??[]).map(value=>{const url=new URL(value);if(url.protocol!=="https:"||url.origin!==value||url.username||url.password)throw new Error("INVALID_BILLING_ORIGIN");return value;}));
 const limits=connectionConcurrency(options.concurrency),active=new Map<string,number>();let total=0;
 const handle=(kind:"checkout"|"confirmation"|"status"):RequestHandler=>async(req,res)=>{
  res.setHeader("Cache-Control","no-store");
  const controller=new AbortController();let acquired:string|undefined,status=503,error="BILLING_UNAVAILABLE";
  const disconnected=()=>{if(!res.writableFinished)controller.abort();};res.once("close",disconnected);
  let aborted!:()=>void;
  const cancelled=new Promise<never>((_resolve,reject)=>{aborted=()=>reject(new Error("BILLING_UNAVAILABLE"));controller.signal.addEventListener("abort",aborted,{once:true});});
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
   const work=(async()=>{
    const reject=(code:number,message:string):never=>{status=code;error=message;throw new Error(message);};
    if(req.header("origin")&&!origins.has(req.header("origin")!))reject(403,"BILLING_ORIGIN_REJECTED");
    if(!req.header("authorization")?.startsWith("Bearer "))reject(401,"SENDER_AUTHENTICATION_REQUIRED");
    let customer;
    try{customer=await options.authenticator.authenticate(req.header("authorization"),controller.signal);if(!customer.userId?.trim()||customer.userId.length>200||/[\x00-\x1f\x7f]/.test(customer.userId))throw new Error();}
    catch{reject(401,"SENDER_AUTHENTICATION_REQUIRED");}
    controller.signal.throwIfAborted();
    if(!req.is("application/json"))reject(415,"BILLING_JSON_REQUIRED");
    const parsed=(kind==="checkout"?checkout:kind==="confirmation"?confirmation:statusInput).safeParse(req.body);
    if(!parsed.success)reject(400,"INVALID_BILLING_REQUEST");
    const userId=customer!.userId;
    if(total>=limits.total||(active.get(userId)??0)>=limits.perCustomer)reject(503,"BILLING_BUSY");
    acquired=userId;active.set(userId,(active.get(userId)??0)+1);total++;
    if(kind==="status"){
     if(!options.entitlements.licenseStatus)throw new Error("LICENSE_STATUS_UNAVAILABLE");
     const result=await options.entitlements.licenseStatus(userId);
     controller.signal.throwIfAborted();return {code:200,body:result};
    }
    if(kind==="checkout"){
     const input=checkout.parse(parsed.data);
     const result=await options.payments.createCheckout({userId,plan:input.plan,product:"annual-license",amountUsdCents:priceForPlan(input.plan),requestId:input.requestId});
     controller.signal.throwIfAborted();
     return {code:201,body:{checkoutId:result.checkoutId,providerReference:result.providerReference,checkoutUrl:result.checkoutUrl}};
    }
    const {providerReference}=confirmation.parse(parsed.data);
    try{
     const license=await options.entitlements.activateFromPayment(providerReference,undefined,{expectedUserId:userId,beforeApply:()=>controller.signal.throwIfAborted()});
     controller.signal.throwIfAborted();
     if(license.userId!==userId)throw new Error("PAYMENT_CUSTOMER_MISMATCH");
     return {code:200,body:{plan:license.plan,startsAt:license.startsAt.toISOString(),expiresAt:license.expiresAt.toISOString(),amountPaidUsdCents:license.amountPaidUsdCents,status:license.status}};
    }catch(cause){
     if(cause instanceof Error&&["PAYMENT_NOT_COMPLETED","PAYMENT_CUSTOMER_MISMATCH","PAYMENT_REFERENCE_MISMATCH","INVALID_LICENSE_AMOUNT"].includes(cause.message))reject(409,"PAYMENT_CONFIRMATION_REJECTED");
     throw cause;
    }
   })().finally(()=>{
    // A response deadline does not end uncancellable provider/database work.
    if(acquired!==undefined){const remaining=active.get(acquired)!-1;if(remaining)active.set(acquired,remaining);else active.delete(acquired);total--;}
   });
   const reply=await Promise.race([work,cancelled]);
   if(!res.destroyed)res.status(reply.code).json(reply.body);
  }catch{if(!res.destroyed)res.status(controller.signal.aborted?503:status).json({error:controller.signal.aborted?"BILLING_UNAVAILABLE":error});}
  finally{
   clearTimeout(timer);controller.signal.removeEventListener("abort",aborted);res.removeListener("close",disconnected);
  }
 };
 router.post("/checkout",handle("checkout"));router.post("/confirm-payment",handle("confirmation"));router.post("/license-status",handle("status"));return router;
}
