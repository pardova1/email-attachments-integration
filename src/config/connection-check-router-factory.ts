import {createConnectionCheckRouter,type ConnectionCheckRouterOptions} from "../http/connection-check-router.js";
import {createObservedConnectionCoordinatorFactory,type ObservedConnectionCoordinatorOptions} from "./observed-connection-coordinator-factory.js";

export interface ConfiguredConnectionCheckRouterOptions extends Omit<ConnectionCheckRouterOptions,"coordinatorFor"> {
 observations?:ObservedConnectionCoordinatorOptions;
}

// One mount-time composition retains the shared fallback store and readiness
// agent while the coordinator factory creates fresh discovery for each request.
// Omitted adapters keep authenticated requests unavailable, never ready.
export function createConfiguredConnectionCheckRouter(options:ConfiguredConnectionCheckRouterOptions){
 const {observations,...http}=options;
 const coordinatorFor=observations?createObservedConnectionCoordinatorFactory(observations):undefined;
 return createConnectionCheckRouter({...http,coordinatorFor});
}
