import {connectionConcurrency} from "../config/connection-concurrency.js";
import {randomUUID} from "node:crypto";
import {Router} from "express";
import {z} from "zod";
import {INITIAL_MAX_TRANSFER_BYTES,MAX_CHUNK_BYTES} from "../domain/transfer.js";
import {senderExpirationNotice,recipientExpirationNotice} from "../domain/expiration-notices.js";
import {CONNECTION_FIELDS,requireConnectionCustomerScope} from "../email/customer-connection-fallback.js";
import type {ConnectionCheckRouterOptions,ConnectionRequestContext} from "./connection-check-router.js";
import type {SendAuthorizationService} from "../services/send-authorization-service.js";
import type {SenderTransferAccessService} from "../services/sender-transfer-access.js";

export interface SenderTransferRouterOptions {
 authenticator:ConnectionCheckRouterOptions["authenticator"];
 coordinatorFor?:ConnectionCheckRouterOptions["coordinatorFor"];
 sends:Pick<SendAuthorizationService,"createForValidUser">;
 senderAccess:Pick<SenderTransferAccessService,"issue">;
 allowedOrigins?:string[];
 timeoutMs?:number;
 clock?:()=>Date;
 concurrency?:ConnectionCheckRouterOptions["concurrency"];
}
const hint=z.string().trim().min(1).max(256).refine(value=>!/[\x00-\x1f\x7f*]/.test(value));
const createSchema=z.object({
 fileName:z.string().min(1).max(1024),contentType:z.string().min(1).max(255),
 totalBytes:z.number().int().positive().max(INITIAL_MAX_TRANSFER_BYTES),
 chunkBytes:z.number().int().positive().max(MAX_CHUNK_BYTES).optional(),
 senderExpirationConfirmed:z.literal(true),originalSha256:z.string().regex(/^[a-fA-F0-9]{64}$/),
 software:z.object({client:hint.optional(),platform:hint.optional(),softwareVersion:hint.optional()}).strict().optional(),
 connection:z.object({formId:z.uuid(),selections:z.object(Object.fromEntries(CONNECTION_FIELDS.map(field=>[field,z.string().min(1).max(256).optional()])) as Record<typeof CONNECTION_FIELDS[number],z.ZodOptional<z.ZodString>>).strict()}).strict().optional()
}).strict();

// This is the transfer-creation boundary, not an email delivery endpoint.
// Browser ready flags and caller-supplied identity/evidence are never accepted.
export function createSenderTransferRouter(options:SenderTransferRouterOptions){
 const router=Router(),timeout=options.timeoutMs??30_000,clock=options.clock??(()=>new Date());
 if(!Number.isInteger(timeout)||timeout<1||timeout>120_000)throw new Error("INVALID_SEND_REQUEST_TIMEOUT");
 const origins=new Set((options.allowedOrigins??[]).map(origin=>{const url=new URL(origin);if(url.protocol!=="https:"||url.origin!==origin||url.username||url.password)throw new Error("INVALID_CONNECTION_ORIGIN");return origin;}));
 const {perCustomer,total:limit}=connectionConcurrency(options.concurrency);
 const active=new Map<string,number>();let total=0;
 router.post("/",async(req,res)=>{
  res.setHeader("Cache-Control","no-store");
  const controller=new AbortController();let acquired:string|undefined;
  const disconnected=()=>{if(!res.writableFinished)controller.abort(new Error("SEND_REQUEST_DISCONNECTED"));};res.once("close",disconnected);
  let aborted!:()=>void;
  const cancelled=new Promise<never>((_resolve,reject)=>{aborted=()=>reject(controller.signal.reason);controller.signal.addEventListener("abort",aborted,{once:true});});
  const timer=setTimeout(()=>controller.abort(new Error("SEND_REQUEST_TIMEOUT")),timeout);
  let status=503,error="SEND_CONNECTION_NOT_READY";
  try{
   const transfer=await Promise.race([(async()=>{
    if(req.header("origin")&&!origins.has(req.header("origin")!)){status=403;error="CONNECTION_ORIGIN_REJECTED";throw new Error(error);}
    if(!req.header("authorization")?.startsWith("Bearer ")){status=401;error="SENDER_AUTHENTICATION_REQUIRED";throw new Error(error);}
    let customer;
    try{customer=await options.authenticator.authenticate(req.header("authorization"),controller.signal);requireConnectionCustomerScope(customer.userId);}
    catch{status=401;error="SENDER_AUTHENTICATION_REQUIRED";throw new Error(error);}
    controller.signal.throwIfAborted();
    if(!req.is("application/json")){status=415;error="CONNECTION_JSON_REQUIRED";throw new Error(error);}
    const parsed=createSchema.safeParse(req.body);
    if(!parsed.success){status=400;error="INVALID_REQUEST";throw new Error(error);}
    if(!options.coordinatorFor||(active.get(customer.userId)??0)>=perCustomer||total>=limit)throw new Error(error);
    const scope=customer.userId;acquired=scope;active.set(scope,(active.get(scope)??0)+1);total++;
    const {software,connection,...input}=parsed.data;
    const context:ConnectionRequestContext={requestReference:`send-request:${randomUUID()}`,networkAddress:req.socket.remoteAddress??"",userAgent:req.header("user-agent")?.slice(0,2048),...(software?{softwareHints:software}:{})};
    const coordinator=await options.coordinatorFor({...customer},context,controller.signal);
    controller.signal.throwIfAborted();coordinator.assertCustomerScope(scope);
    const checked=connection?await coordinator.submitFallback(connection.formId,connection.selections,controller.signal):await coordinator.check(controller.signal);
    controller.signal.throwIfAborted();
    if(checked.status!=="assessed"||checked.retryRequired||checked.validation.assessment.status!=="verified")throw new Error(error);
    const environment=structuredClone(checked.validation.assessment.environment);
    const requireCurrent=()=>{
     controller.signal.throwIfAborted();
     if(coordinator.assessCurrentReadiness(environment,scope).status!=="verified")throw new Error("SEND_CONNECTION_NOT_READY");
    };
    requireCurrent();
    // Licensing can await remote state. Check expiry/withdrawal/cancellation
    // again after that await, immediately before durable transfer creation.
    try{return await options.sends.createForValidUser(scope,input,clock,requireCurrent);}
    catch(cause){
     if(cause instanceof Error&&cause.message==="ACTIVE_LICENSE_REQUIRED"){status=403;error="ACTIVE_LICENSE_REQUIRED";}
     else if(!(cause instanceof Error&&cause.message==="SEND_CONNECTION_NOT_READY"))error="TRANSFER_CREATION_UNAVAILABLE";
     throw cause;
    }
   })(),cancelled]);
   if(!res.destroyed)res.status(201).json({id:transfer.id,chunkBytes:transfer.chunkBytes,uploadExpiresAt:transfer.uploadExpiresAt,uploadToken:options.senderAccess.issue(transfer.id,transfer.uploadExpiresAt),senderNotice:senderExpirationNotice,recipientNotice:recipientExpirationNotice,uploadPartUrlTemplate:`/v1/transfers/${transfer.id}/parts/{partNumber}`});
  }catch{
   if(!res.destroyed)res.status(controller.signal.aborted?503:status).json({error:controller.signal.aborted?"SEND_CONNECTION_NOT_READY":error,...(error==="ACTIVE_LICENSE_REQUIRED"?{note:"Please renew your service."}:{})});
  }finally{
   if(acquired!==undefined){const remaining=(active.get(acquired)??1)-1;if(remaining)active.set(acquired,remaining);else active.delete(acquired);total--;}
   clearTimeout(timer);controller.signal.removeEventListener("abort",aborted);res.removeListener("close",disconnected);
  }
 });
 return router;
}
