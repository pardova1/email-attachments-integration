import express,{Router,type ErrorRequestHandler} from "express";
import {z} from "zod";
import type {EntitlementService} from "../billing/entitlement-service.js";
import {connectionConcurrency,type ConnectionConcurrency} from "../config/connection-concurrency.js";
import {STRIPE_WEBHOOK_MAX_BYTES,verifyStripeWebhookSignature} from "../security/stripe-webhook-signature.js";
export interface StripeWebhookOptions {
 secret?:string;
 expectedLiveMode?:boolean;
 entitlements:Pick<EntitlementService,"activateFromPayment">;
 timeoutMs?:number;
 concurrency?:ConnectionConcurrency;
 clock?:()=>number;
}
const eventSchema=z.object({id:z.string().regex(/^evt_[A-Za-z0-9]+$/),object:z.literal("event"),type:z.string().min(1).max(128),livemode:z.boolean(),account:z.string().optional(),data:z.object({object:z.unknown()})});
const checkoutSchema=z.object({id:z.string().regex(/^cs_(test|live)_[A-Za-z0-9]+$/),object:z.literal("checkout.session"),livemode:z.boolean(),metadata:z.object({bridge_product:z.literal("email-bridge-license-v1"),user_id:z.string().min(1).max(200),plan:z.enum(["individual","business"])})});

// Mount before express.json(): signatures cover the exact raw bytes.
// Acknowledgement occurs only after application succeeds; failures remain
// retryable. The durable payment ledger provides grant idempotency.
export function createStripeWebhookRouter(options:StripeWebhookOptions){
 const router=Router();
 if(options.secret===undefined){router.post("/",(_req,res)=>res.setHeader("Cache-Control","no-store").status(503).json({error:"STRIPE_WEBHOOK_UNAVAILABLE"}));return router;}
 const secret=options.secret,timeout=options.timeoutMs??5000,clock=options.clock??Date.now;
 if(!/^whsec_[A-Za-z0-9]+$/.test(secret)||typeof options.expectedLiveMode!=="boolean"||!Number.isInteger(timeout)||timeout<1||timeout>30_000)throw new Error("STRIPE_WEBHOOK_NOT_CONFIGURED");
 const live=options.expectedLiveMode,limits=connectionConcurrency(options.concurrency),active=new Set<string>();let total=0;
 router.post("/",express.raw({type:"application/json",limit:STRIPE_WEBHOOK_MAX_BYTES,inflate:false}),async(req,res)=>{
  res.setHeader("Cache-Control","no-store");let parsed:z.infer<typeof eventSchema>;
  try{
   if(!req.is("application/json")||!Buffer.isBuffer(req.body))throw new Error();
   verifyStripeWebhookSignature(req.body,req.header("stripe-signature"),secret,clock());
   parsed=eventSchema.parse(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(req.body)));
   if(parsed.livemode!==live)throw new Error();
  }catch{res.status(400).json({error:"STRIPE_WEBHOOK_REJECTED"});return;}
  if(parsed.account||!["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(parsed.type)){res.status(200).json({received:true,handled:false});return;}
  const object=parsed.data.object as {object?:unknown;metadata?:{bridge_product?:unknown}}|null;
  if(object?.object==="checkout.session"&&object.metadata?.bridge_product!=="email-bridge-license-v1"){res.status(200).json({received:true,handled:false});return;}
  const session=checkoutSchema.safeParse(parsed.data.object);
  if(!session.success){res.status(400).json({error:"STRIPE_WEBHOOK_REJECTED"});return;}
  const checkout=session.data;
  if(checkout.livemode!==live||!checkout.id.startsWith(`cs_${live?"live":"test"}_`)){res.status(400).json({error:"STRIPE_WEBHOOK_REJECTED"});return;}
  if(active.has(checkout.id)||total>=limits.total){res.status(503).json({error:"STRIPE_WEBHOOK_BUSY"});return;}
  active.add(checkout.id);total++;
  const controller=new AbortController(),disconnected=()=>{if(!res.writableFinished)controller.abort();};res.once("close",disconnected);
  let aborted!:()=>void;
  const cancelled=new Promise<never>((_resolve,reject)=>{aborted=()=>reject(new Error("STRIPE_WEBHOOK_UNAVAILABLE"));controller.signal.addEventListener("abort",aborted,{once:true});});
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
   const work=Promise.resolve().then(()=>{
    controller.signal.throwIfAborted();
    return options.entitlements.activateFromPayment(`stripe-checkout:${checkout.id}`,undefined,{expectedUserId:checkout.metadata.user_id,beforeApply:()=>controller.signal.throwIfAborted()});
   }).finally(()=>{
    // Keep admission until outstanding work settles, even after the response ends.
    active.delete(checkout.id);total--;
   });
   await Promise.race([work,cancelled]);
   controller.signal.throwIfAborted();
   if(!res.destroyed)res.status(200).json({received:true,handled:true});
  }catch{if(!res.destroyed)res.status(503).json({error:"STRIPE_WEBHOOK_UNAVAILABLE"});}
  finally{clearTimeout(timer);controller.signal.removeEventListener("abort",aborted);res.removeListener("close",disconnected);}
 });
 const parserErrors:ErrorRequestHandler=(error,_req,res,_next)=>{res.setHeader("Cache-Control","no-store");res.status(error?.type==="entity.too.large"?413:400).json({error:"STRIPE_WEBHOOK_REJECTED"});};router.use(parserErrors);
 return router;
}
export function configuredStripeWebhookOptions(entitlements:StripeWebhookOptions["entitlements"],env:NodeJS.ProcessEnv=process.env):StripeWebhookOptions{
 if(env.STRIPE_WEBHOOK_SECRET===undefined)return {entitlements};
 if(env.PAYMENT_PROVIDER!=="stripe"||!/^sk_(live|test)_[A-Za-z0-9]+$/.test(env.STRIPE_SECRET_KEY??"")||(env.NODE_ENV==="production"&&!env.STRIPE_SECRET_KEY!.startsWith("sk_live_")))throw new Error("STRIPE_WEBHOOK_NOT_CONFIGURED");
 return {entitlements,secret:env.STRIPE_WEBHOOK_SECRET,expectedLiveMode:env.STRIPE_SECRET_KEY!.startsWith("sk_live_")};
}
