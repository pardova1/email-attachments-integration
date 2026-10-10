import {AutomaticConnectionCoordinator,type ConnectionDiscoveryPort,type ConnectionToolCatalog} from "../email/automatic-connection-coordinator.js";
import {CustomerConnectionFallback,requireConnectionCustomerScope} from "../email/customer-connection-fallback.js";
import {GlobalConnectionReadinessAgent} from "../email/global-connection-readiness-agent.js";
import type {ConnectionCheckRouterOptions,ConnectionRequestContext} from "../http/connection-check-router.js";

export interface ConnectionCoordinatorFactoryOptions {
 discoveryFor:(customer:{userId:string},context:ConnectionRequestContext,signal:AbortSignal)=>Promise<ConnectionDiscoveryPort>;
 catalog:ConnectionToolCatalog;
 fallback:CustomerConnectionFallback;
 clock?:()=>Date;
 internalTimeoutMs?:number;
}

// Keep forms across HTTP requests, but never cache discovery tied to an old
// request's network/client context. Authenticated scope is supplied by the router.
export function createConnectionCoordinatorFactory(options:ConnectionCoordinatorFactoryOptions):NonNullable<ConnectionCheckRouterOptions["coordinatorFor"]>{
 const clock=options.clock??(()=>new Date()),timeout=options.internalTimeoutMs??10_000;
 if(!Number.isInteger(timeout)||timeout<1||timeout>60_000)throw new Error("INVALID_AUTOMATIC_CONNECTION_POLICY");
 const readiness=new GlobalConnectionReadinessAgent(),discoveryFor=options.discoveryFor.bind(options),catalog=options.catalog,fallback=options.fallback;
 return async(customer,context,signal)=>{
  signal.throwIfAborted();requireConnectionCustomerScope(customer.userId);
  const scope=customer.userId;
  const discovery=await discoveryFor({userId:scope},structuredClone(context),signal);
  signal.throwIfAborted();
  if(!discovery||typeof discovery.discover!=="function")throw new Error("CONNECTION_DISCOVERY_NOT_CONFIGURED");
  return new AutomaticConnectionCoordinator(discovery,catalog,readiness,clock,timeout,fallback,scope);
 };
}
