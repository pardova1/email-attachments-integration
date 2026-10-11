import { CustomerConnectionFallback, requireConnectionCustomerScope, CONNECTION_FIELDS, type ConnectionField } from "./customer-connection-fallback.js";
import { GlobalConnectionReadinessAgent, type ConnectionCheck, type ConnectionEnvironment } from "./global-connection-readiness-agent.js";
import { GlobalConnectionValidationRunner, type ConnectionProbeTool } from "./global-connection-validation-runner.js";

export interface AutomaticConnectionDiscovery {
  environment: Partial<ConnectionEnvironment>;
  observedAt: string;
  sourceReference: string;
  // A source failed internally; missing details must not become customer work.
  retryFields?:ConnectionField[];
}

// Implementations read trusted server/network observations and automatically
// collected client/provider metadata. Customer dropdowns are offered separately only when discovery is incomplete.
export interface ConnectionDiscoveryPort {
  discover(signal: AbortSignal): Promise<AutomaticConnectionDiscovery>;
}
export interface ConnectionToolCatalog {
  toolsFor(environment: ConnectionEnvironment, signal: AbortSignal): Promise<Partial<Record<ConnectionCheck, ConnectionProbeTool>>>;
}

export class AutomaticConnectionCoordinator {
  constructor(
    private readonly discovery: ConnectionDiscoveryPort,
    private readonly catalog: ConnectionToolCatalog,
    private readonly readiness: GlobalConnectionReadinessAgent,
    private readonly clock = () => new Date(),
    private readonly internalTimeoutMs = 10_000,
    private readonly fallback?: CustomerConnectionFallback,
    private readonly customerScope?:string
  ) {
    if(fallback||customerScope!==undefined)requireConnectionCustomerScope(customerScope);
    if (!Number.isInteger(internalTimeoutMs) || internalTimeoutMs < 1 || internalTimeoutMs > 60_000) throw new Error("INVALID_AUTOMATIC_CONNECTION_POLICY");
  }

  assertCustomerScope(scope:string) {
    requireConnectionCustomerScope(scope);
    if(this.customerScope!==scope)throw new Error("CONNECTION_COORDINATOR_SCOPE_MISMATCH");
  }

  // Automatic discovery remains the first step; no manual input is required here.
  async check(signal?: AbortSignal) {
    signal?.throwIfAborted();
    let discovered:AutomaticConnectionDiscovery;
    try {
      discovered=await this.discover(signal);
    } catch {
      signal?.throwIfAborted();
      return this.internalRetry();
    }
    return this.assessDiscovery(discovered,signal);
  }

  async submitFallback(formId:string,selections:Partial<Record<ConnectionField,string>>,signal?:AbortSignal) {
    signal?.throwIfAborted();
    if(!this.fallback)throw new Error("CONNECTION_FALLBACK_NOT_CONFIGURED");
    const selected=this.fallback.resolve(this.customerScope!,formId,selections);
    let discovered:AutomaticConnectionDiscovery;
    try{discovered=await this.discover(signal);}catch{
      signal?.throwIfAborted();
      return this.internalRetry();
    }
    if(discovered.retryFields?.length)return this.internalRetry();
    if(!this.fallback.matchesCurrent(this.customerScope!,formId,selections,discovered.environment))return this.assessDiscovery(discovered,signal);
    const environment=this.readiness.assess(selected,this.clock()).environment;
    return this.validate(environment,`customer-selection:${formId}`,"customer-selection",signal);
  }

  private async discover(signal?:AbortSignal){
    const discovered=await this.internalStep(probeSignal=>this.discovery.discover(probeSignal),signal);
    const observed=Date.parse(discovered.observedAt),now=this.clock();
    if(!Number.isFinite(observed)||!Number.isFinite(now.getTime())||observed>now.getTime()||now.getTime()-observed>5*60*1000||!discovered.sourceReference.trim())throw new Error("INVALID_AUTOMATIC_DISCOVERY");
    if(discovered.retryFields!==undefined&&(!Array.isArray(discovered.retryFields)||discovered.retryFields.some(field=>!CONNECTION_FIELDS.includes(field))))throw new Error("INVALID_AUTOMATIC_DISCOVERY");
    return discovered;
  }

  private assessDiscovery(discovered:AutomaticConnectionDiscovery,signal?:AbortSignal){
    try{
      if(discovered.retryFields?.length)return Promise.resolve(this.internalRetry());
      const missing=CONNECTION_FIELDS.filter(key=>typeof discovered.environment[key]!=="string"||!discovered.environment[key]?.trim()||key==="country"&&!/^[A-Z]{2}$/i.test(discovered.environment[key]!.trim()));
      if(missing.length)return Promise.resolve(this.offerFallback(discovered.environment,missing));
      const environment=this.readiness.assess(discovered.environment as ConnectionEnvironment,this.clock()).environment;
      return this.validate(environment,discovered.sourceReference,"automatic",signal);
    }catch{return Promise.resolve(this.internalRetry());}
  }

  private offerFallback(known:Partial<ConnectionEnvironment>,missing:ConnectionField[]) {
    try {
      const form=this.fallback?.prepare(this.customerScope!,known,missing);
      if(form)return {status:"customer-input-required" as const,form,retryRequired:true as const};
    } catch { /* Catalog/capacity failure stays an internal retry. */ }
    return this.internalRetry();
  }

  private internalRetry(){return {status:"pending-internal-retry" as const,retryRequired:true as const,reason:"AUTOMATIC_CONNECTION_CHECK_UNAVAILABLE"};}

  private async validate(environment:ConnectionEnvironment,reference:string,source:"automatic"|"customer-selection",signal?:AbortSignal) {
    try {
      const tools=await this.internalStep(probeSignal=>this.catalog.toolsFor(structuredClone(environment),probeSignal),signal);
      const validation=await new GlobalConnectionValidationRunner(this.readiness,tools,10_000,15*60*1000,this.clock).run(environment,signal);
      return {status:"assessed" as const,validation,discoveryReference:reference,environmentSource:source,retryRequired:validation.assessment.status!=="verified"};
    } catch {
      signal?.throwIfAborted();
      return {status:"pending-internal-retry" as const,retryRequired:true as const,reason:"AUTOMATIC_CONNECTION_CHECK_UNAVAILABLE"};
    }
  }

  private async internalStep<T>(operation: (signal: AbortSignal) => Promise<T>, external?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const signal = external ? AbortSignal.any([external, controller.signal]) : controller.signal;
    signal.throwIfAborted();
    let aborted!: () => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      aborted = () => reject(signal.reason);
      signal.addEventListener("abort", aborted, { once: true });
    });
    const timer = setTimeout(() => controller.abort(new Error("AUTOMATIC_CONNECTION_TIMEOUT")), this.internalTimeoutMs);
    try { return await Promise.race([operation(signal), cancelled]); }
    finally { clearTimeout(timer); signal.removeEventListener("abort", aborted); }
  }
}
