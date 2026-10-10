import { CustomerConnectionFallback, requireConnectionCustomerScope, CONNECTION_FIELDS, type ConnectionField } from "./customer-connection-fallback.js";
import { GlobalConnectionReadinessAgent, type ConnectionCheck, type ConnectionEnvironment } from "./global-connection-readiness-agent.js";
import { GlobalConnectionValidationRunner, type ConnectionProbeTool } from "./global-connection-validation-runner.js";

export interface AutomaticConnectionDiscovery {
  environment: Partial<ConnectionEnvironment>;
  observedAt: string;
  sourceReference: string;
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
    let environment:ConnectionEnvironment,reference:string;
    try {
      const discovered=await this.internalStep(probeSignal=>this.discovery.discover(probeSignal),signal);
      const observed=Date.parse(discovered.observedAt),now=this.clock();
      if(!Number.isFinite(observed)||!Number.isFinite(now.getTime())||observed>now.getTime()||now.getTime()-observed>5*60*1000||!discovered.sourceReference.trim())throw new Error("INVALID_AUTOMATIC_DISCOVERY");
      const missing=CONNECTION_FIELDS.filter(key=>typeof discovered.environment[key]!=="string"||!discovered.environment[key]?.trim()||key==="country"&&!/^[A-Z]{2}$/i.test(discovered.environment[key]!.trim()));
      if(missing.length)return this.offerFallback(discovered.environment,missing);
      environment=this.readiness.assess(discovered.environment as ConnectionEnvironment,now).environment;
      reference=discovered.sourceReference;
    } catch {
      signal?.throwIfAborted();
      return this.offerFallback({},[...CONNECTION_FIELDS]);
    }
    return this.validate(environment,reference,"automatic",signal);
  }

  async submitFallback(formId:string,selections:Partial<Record<ConnectionField,string>>,signal?:AbortSignal) {
    signal?.throwIfAborted();
    if(!this.fallback)throw new Error("CONNECTION_FALLBACK_NOT_CONFIGURED");
    const selected=this.fallback.resolve(this.customerScope!,formId,selections);
    const environment=this.readiness.assess(selected,this.clock()).environment;
    return this.validate(environment,`customer-selection:${formId}`,"customer-selection",signal);
  }

  private offerFallback(known:Partial<ConnectionEnvironment>,missing:ConnectionField[]) {
    try {
      const form=this.fallback?.prepare(this.customerScope!,known,missing);
      if(form)return {status:"customer-input-required" as const,form,retryRequired:true as const};
    } catch { /* Catalog/capacity failure stays an internal retry. */ }
    return {status:"pending-internal-retry" as const,retryRequired:true as const,reason:"AUTOMATIC_CONNECTION_CHECK_UNAVAILABLE"};
  }

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
