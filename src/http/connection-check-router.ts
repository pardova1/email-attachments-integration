import {randomUUID} from "node:crypto";
import {Router,type RequestHandler} from "express";
import {z} from "zod";
import {AutomaticConnectionCoordinator} from "../email/automatic-connection-coordinator.js";
import {CONNECTION_FIELDS,requireConnectionCustomerScope} from "../email/customer-connection-fallback.js";
import {CONNECTION_TRANSLATIONS,selectConnectionLanguage} from "../email/connection-languages.js";
import type {AuthenticatedSender} from "../security/supabase-sender-authenticator.js";

export interface ConnectionRequestContext {
 requestReference:string;
 networkAddress:string;
 userAgent?:string;
 softwareHints?:{client?:string;platform?:string;softwareVersion?:string};
}
export interface ConnectionCheckRouterOptions {
 authenticator:{authenticate(authorization:string|undefined,signal?:AbortSignal):Promise<AuthenticatedSender>};
 coordinatorFor?:(customer:AuthenticatedSender,context:ConnectionRequestContext,signal:AbortSignal)=>Promise<AutomaticConnectionCoordinator>;
 allowedOrigins?:string[];
 timeoutMs?:number;
}
const hint=z.string().trim().min(1).max(256).refine(value=>!/[\x00-\x1f\x7f*]/.test(value));
const language=z.string().min(1).max(100).optional();
const checkSchema=z.object({language,software:z.object({client:hint.optional(),platform:hint.optional(),softwareVersion:hint.optional()}).strict().optional()}).strict();
const selectionSchema=z.object({formId:z.uuid(),language,selections:z.object(Object.fromEntries(CONNECTION_FIELDS.map(field=>[field,z.string().min(1).max(256).optional()])) as Record<typeof CONNECTION_FIELDS[number],z.ZodOptional<z.ZodString>>).strict()}).strict();

// Bearer-authenticated JSON API. Identity never comes from body/query/cookies.
export function createConnectionCheckRouter(options:ConnectionCheckRouterOptions) {
 const router=Router(),timeoutMs=options.timeoutMs??30_000;
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>120_000)throw new Error("INVALID_CONNECTION_REQUEST_TIMEOUT");
 const origins=new Set((options.allowedOrigins??[]).map(origin=>{
  const url=new URL(origin);if(url.protocol!=="https:"||url.origin!==origin||url.username||url.password)throw new Error("INVALID_CONNECTION_ORIGIN");return origin;
 }));
 const handle=(selection:boolean):RequestHandler=>async(req,res)=>{
  res.setHeader("Cache-Control","no-store");
  const controller=new AbortController();
  const disconnected=()=>{if(!res.writableFinished)controller.abort(new Error("CONNECTION_REQUEST_DISCONNECTED"));};
  res.once("close",disconnected);
  let aborted!:(()=>void);
  const cancelled=new Promise<never>((_resolve,reject)=>{aborted=()=>reject(controller.signal.reason);controller.signal.addEventListener("abort",aborted,{once:true});});
  const timer=setTimeout(()=>controller.abort(new Error("CONNECTION_REQUEST_TIMEOUT")),timeoutMs);
  let status=503,error="CONNECTION_CHECK_UNAVAILABLE";
  try{
   const result=await Promise.race([(async()=>{
    if(req.header("origin")&&!origins.has(req.header("origin")!)){status=403;error="CONNECTION_ORIGIN_REJECTED";throw new Error(error);}
    if(!req.header("authorization")?.startsWith("Bearer ")){status=401;error="SENDER_AUTHENTICATION_REQUIRED";throw new Error(error);}
    let customer:AuthenticatedSender;
    try{customer=await options.authenticator.authenticate(req.header("authorization"),controller.signal);requireConnectionCustomerScope(customer.userId);}
    catch{status=401;error="SENDER_AUTHENTICATION_REQUIRED";throw new Error(error);}
    controller.signal.throwIfAborted();
    if(!req.is("application/json")){status=415;error="CONNECTION_JSON_REQUIRED";throw new Error(error);}
    const input=selection?selectionSchema.safeParse(req.body):checkSchema.safeParse(req.body);
    if(!input.success){status=400;error="INVALID_CONNECTION_REQUEST";throw new Error(error);}
    if(!options.coordinatorFor)throw new Error("CONNECTION_ADAPTERS_NOT_CONFIGURED");
    const context:ConnectionRequestContext={requestReference:`connection-request:${randomUUID()}`,networkAddress:req.socket.remoteAddress??"",userAgent:req.header("user-agent")?.slice(0,2048),...("software" in input.data?{softwareHints:input.data.software}:{})};
    const coordinator=await options.coordinatorFor({...customer},context,controller.signal);
    controller.signal.throwIfAborted();
    coordinator.assertCustomerScope(customer.userId);
    let checked;
    try{
     checked=selection?await coordinator.submitFallback((input.data as z.infer<typeof selectionSchema>).formId,(input.data as z.infer<typeof selectionSchema>).selections,controller.signal):await coordinator.check(controller.signal);
    }catch(cause){
     const message=cause instanceof Error?cause.message:"";
     if(["CONNECTION_FORM_UNAVAILABLE","CONNECTION_FORM_EXPIRED","INVALID_CONNECTION_SELECTION","INCOMPATIBLE_CONNECTION_SELECTION","INCOMPLETE_CONNECTION_SELECTION"].includes(message)){status=400;error="CONNECTION_SELECTION_REJECTED";}
     throw cause;
    }
    controller.signal.throwIfAborted();
    const selectedLanguage=selectConnectionLanguage(input.data.language??"en");
    if(checked.status==="pending-internal-retry")return {httpStatus:503,body:{...checked,language:selectedLanguage}};
    if(checked.status!=="customer-input-required")return {httpStatus:200,body:{...checked,language:selectedLanguage}};
    const text=CONNECTION_TRANSLATIONS[selectedLanguage],countryNames=new Intl.DisplayNames([selectedLanguage],{type:"region"});
    return {httpStatus:200,body:{...checked,language:selectedLanguage,direction:text.direction,languageOptions:Object.entries(CONNECTION_TRANSLATIONS).map(([tag,pack])=>({tag,label:pack.language})),form:{...checked.form,message:text.message,fields:checked.form.fields.map(field=>({...field,label:text.fields[field.key],options:field.options.map(option=>({...option,label:field.key==="country"?countryNames.of(option.value)??option.label:option.label}))}))}}};
   })(),cancelled]);
   if(!res.destroyed)res.status(result.httpStatus).json(result.body);
  }catch{
   if(!res.destroyed)res.status(controller.signal.aborted?503:status).json({error:controller.signal.aborted?"CONNECTION_CHECK_UNAVAILABLE":error});
  }finally{
   clearTimeout(timer);controller.signal.removeEventListener("abort",aborted);res.removeListener("close",disconnected);
  }
 };
 router.post("/check",handle(false));router.post("/selections",handle(true));
 return router;
}
