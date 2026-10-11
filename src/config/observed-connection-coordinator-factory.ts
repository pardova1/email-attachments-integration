import {createConnectionCoordinatorFactory,type ConnectionCoordinatorFactoryOptions} from "./connection-coordinator-factory.js";
import {ConnectionObservationDiscovery,requireConnectionObservationRetryPolicy,type ConnectionObservationRetryPolicy,type ConnectionObservationSources} from "../email/connection-observation-discovery.js";
import type {ConnectionRequestContext} from "../http/connection-check-router.js";

export interface ObservedConnectionCoordinatorOptions extends Omit<ConnectionCoordinatorFactoryOptions,"discoveryFor"> {
 network:(customer:{userId:string},context:ConnectionRequestContext,signal:AbortSignal)=>ReturnType<ConnectionObservationSources["network"]>;
 provider:(customer:{userId:string},signal:AbortSignal)=>ReturnType<ConnectionObservationSources["provider"]>;
 sourceTimeoutMs?:number;
 sourceRetry?:ConnectionObservationRetryPolicy;
}
// Composition hook: network/provider observations are operator adapters, while
// software is explicitly labelled as client-reported request metadata.
export function createObservedConnectionCoordinatorFactory(options:ObservedConnectionCoordinatorOptions){
 const clock=options.clock??(()=>new Date()),timeout=options.sourceTimeoutMs??2000;
 const retry=requireConnectionObservationRetryPolicy(options.sourceRetry);
 if(typeof options.network!=="function"||typeof options.provider!=="function"||!Number.isInteger(timeout)||timeout<1||timeout>5000)throw new Error("INVALID_DISCOVERY_SOURCES");
 const network=options.network.bind(options),provider=options.provider.bind(options);
 return createConnectionCoordinatorFactory({...options,clock,async discoveryFor(customer,context,signal){
  signal.throwIfAborted();const receivedAt=clock().toISOString();
  const details={...context.softwareHints};
  return new ConnectionObservationDiscovery({
   network:sourceSignal=>network({...customer},structuredClone(context),sourceSignal),
   provider:sourceSignal=>provider({...customer},sourceSignal),
   async software(sourceSignal){sourceSignal.throwIfAborted();return {details,observedAt:receivedAt,sourceReference:`client-reported:${context.requestReference}`};}
  },clock,timeout,retry);
 }});
}
