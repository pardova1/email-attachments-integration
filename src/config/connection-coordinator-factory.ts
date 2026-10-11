import {AutomaticConnectionCoordinator,type ConnectionDiscoveryPort,type ConnectionToolCatalog} from "../email/automatic-connection-coordinator.js";
import {CustomerConnectionFallback,requireConnectionCustomerScope} from "../email/customer-connection-fallback.js";
import {GlobalConnectionReadinessAgent} from "../email/global-connection-readiness-agent.js";
import type {ConnectionCheckRouterOptions,ConnectionRequestContext} from "../http/connection-check-router.js";

export interface ConnectionCoordinatorFactoryOptions {
 discoveryFor:(customer:{userId:string},context:ConnectionRequestContext,signal:AbortSignal)=>Promise<ConnectionDiscoveryPort>;
 catalog:ConnectionToolCatalog;
 catalogFor?:(customer:{userId:string},context:ConnectionRequestContext,signal:AbortSignal)=>Promise<ConnectionToolCatalog>;
 fallback:CustomerConnectionFallback;
 clock?:()=>Date;
 internalTimeoutMs?:number;
}

// Keep forms across HTTP requests, but never cache discovery tied to an old
// request's network/client context. Evidence belongs to each coordinator, so
// unrelated requests cannot replace it. Authenticated scope comes from the router.
export function createConnectionCoordinatorFactory(options:ConnectionCoordinatorFactoryOptions):NonNullable<ConnectionCheckRouterOptions["coordinatorFor"]>{
 const clock=options.clock??(()=>new Date()),timeout=options.internalTimeoutMs??10_000;
 if(!Number.isInteger(timeout)||timeout<1||timeout>60_000)throw new Error("INVALID_AUTOMATIC_CONNECTION_POLICY");
 if(options.catalogFor!==undefined&&typeof options.catalogFor!=="function")throw new Error("INVALID_CONNECTION_CATALOG_FACTORY");
 const discoveryFor=options.discoveryFor.bind(options),catalog=options.catalog,catalogFor=options.catalogFor?.bind(options),fallback=options.fallback;
 return async(customer,context,signal)=>{
  signal.throwIfAborted();requireConnectionCustomerScope(customer.userId);
  const scope=customer.userId,requestContext=structuredClone(context);
  return withConnectionSetupDeadline(async setupSignal=>{
   const discovery=await discoveryFor({userId:scope},structuredClone(requestContext),setupSignal);
   setupSignal.throwIfAborted();
   if(!discovery||typeof discovery.discover!=="function")throw new Error("CONNECTION_DISCOVERY_NOT_CONFIGURED");
   const selectedCatalog=catalogFor?await catalogFor({userId:scope},structuredClone(requestContext),setupSignal):catalog;
   setupSignal.throwIfAborted();
   if(!selectedCatalog||typeof selectedCatalog.toolsFor!=="function")throw new Error("CONNECTION_CATALOG_NOT_CONFIGURED");
   return new AutomaticConnectionCoordinator(discovery,selectedCatalog,new GlobalConnectionReadinessAgent(),clock,timeout,fallback,scope);
  },signal,timeout);
 };
}


async function withConnectionSetupDeadline<T>(operation:(signal:AbortSignal)=>Promise<T>,external:AbortSignal,timeoutMs:number):Promise<T>{
 external.throwIfAborted();
 const controller=new AbortController(),signal=AbortSignal.any([external,controller.signal]);
 let aborted!:()=>void;
 const cancelled=new Promise<never>((_resolve,reject)=>{
  aborted=()=>reject(signal.reason);
  signal.addEventListener("abort",aborted,{once:true});
 });
 const timer=setTimeout(()=>controller.abort(new Error("CONNECTION_COORDINATOR_SETUP_TIMEOUT")),timeoutMs);
 try{return await Promise.race([operation(signal),cancelled]);}
 finally{clearTimeout(timer);signal.removeEventListener("abort",aborted);}
}
