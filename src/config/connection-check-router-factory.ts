import {createSenderTransferRouter,type SenderTransferRouterOptions} from "../http/sender-transfer-router.js";
import {createConnectionCheckRouter,type ConnectionCheckRouterOptions} from "../http/connection-check-router.js";
import {createObservedConnectionCoordinatorFactory,type ObservedConnectionCoordinatorOptions} from "./observed-connection-coordinator-factory.js";

export interface ConfiguredConnectionCheckRouterOptions extends Omit<ConnectionCheckRouterOptions,"coordinatorFor"> {
 observations?:ObservedConnectionCoordinatorOptions;
}

// One mount-time composition retains the shared fallback store. Coordinators
// get fresh discovery and independent readiness evidence for each request.
// Omitted adapters keep authenticated requests unavailable, never ready.
export function createConfiguredConnectionCheckRouter(options:ConfiguredConnectionCheckRouterOptions){
 const {observations,...http}=options;
 const coordinatorFor=observations?createObservedConnectionCoordinatorFactory(observations):undefined;
 return createConnectionCheckRouter({...http,coordinatorFor});
}


// Both APIs share the same authenticated coordinator factory and fallback store.
// Each request still receives fresh discovery and independent readiness evidence.
export function createConfiguredConnectionRouters(options:ConfiguredConnectionCheckRouterOptions&Pick<SenderTransferRouterOptions,"sends"|"senderAccess">){
 const {observations,sends,senderAccess,...http}=options;
 const coordinatorFor=observations?createObservedConnectionCoordinatorFactory(observations):undefined;
 return {
  checks:createConnectionCheckRouter({...http,coordinatorFor}),
  transfers:createSenderTransferRouter({authenticator:http.authenticator,allowedOrigins:http.allowedOrigins,timeoutMs:http.timeoutMs,concurrency:http.concurrency,clock:observations?.clock,sends,senderAccess,coordinatorFor})
 };
}
