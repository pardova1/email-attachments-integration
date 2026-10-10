import { GlobalConnectionReadinessAgent, type ConnectionCheck, type ConnectionEnvironment } from "./global-connection-readiness-agent.js";
import { GlobalConnectionValidationRunner, type ConnectionProbeTool } from "./global-connection-validation-runner.js";

export interface AutomaticConnectionDiscovery {
  environment: ConnectionEnvironment;
  observedAt: string;
  sourceReference: string;
}

// Implementations read trusted server/network observations and automatically
// collected client/provider metadata. They must never prompt the customer.
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
    private readonly internalTimeoutMs = 10_000
  ) {
    if (!Number.isInteger(internalTimeoutMs) || internalTimeoutMs < 1 || internalTimeoutMs > 60_000) throw new Error("INVALID_AUTOMATIC_CONNECTION_POLICY");
  }

  // Country, software, and routing choices are deliberately absent from this API.
  async check(signal?: AbortSignal) {
    signal?.throwIfAborted();
    try {
      const discovered = await this.internalStep(probeSignal => this.discovery.discover(probeSignal), signal);
      const observed = Date.parse(discovered.observedAt), now = this.clock();
      if (!Number.isFinite(observed) || !Number.isFinite(now.getTime()) || observed > now.getTime() || now.getTime() - observed > 5 * 60 * 1000 || !discovered.sourceReference.trim()) throw new Error("INVALID_AUTOMATIC_DISCOVERY");
      const environment = this.readiness.assess(discovered.environment, now).environment;
      const tools = await this.internalStep(probeSignal => this.catalog.toolsFor(structuredClone(environment), probeSignal), signal);
      const validation = await new GlobalConnectionValidationRunner(this.readiness, tools, 10_000, 15 * 60 * 1000, this.clock).run(environment, signal);
      return { status: "assessed" as const, validation, discoveryReference: discovered.sourceReference, retryRequired: validation.assessment.status !== "verified" };
    } catch {
      signal?.throwIfAborted();
      return { status: "pending-internal-retry" as const, retryRequired: true as const, reason: "AUTOMATIC_CONNECTION_CHECK_UNAVAILABLE" };
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
