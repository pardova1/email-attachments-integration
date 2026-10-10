import { GlobalConnectionReadinessAgent, REQUIRED_CONNECTION_CHECKS, type ConnectionCheck, type ConnectionEnvironment, type ConnectionEvidence } from "./global-connection-readiness-agent.js";

export interface ConnectionProbeResult {
  outcome: "passed" | "failed" | "restricted";
  testReference: string;
  recipientNeedsInstallation?: boolean;
  // Successful evidence must not outlive a tool/profile-specific deadline.
  validUntil?: string;
}
export interface ConnectionProbeTool {
  id: string;
  run(environment: ConnectionEnvironment, signal: AbortSignal): Promise<ConnectionProbeResult>;
}

export class GlobalConnectionValidationRunner {
  private readonly tools: Partial<Record<ConnectionCheck, ConnectionProbeTool>>;
  constructor(
    private readonly agent: GlobalConnectionReadinessAgent,
    tools: Partial<Record<ConnectionCheck, ConnectionProbeTool>>,
    private readonly timeoutMs = 10_000,
    private readonly evidenceLifetimeMs = 15 * 60 * 1000,
    private readonly clock = () => new Date()
  ) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000 || !Number.isInteger(evidenceLifetimeMs) || evidenceLifetimeMs < 1 || evidenceLifetimeMs > 24 * 60 * 60 * 1000) throw new Error("INVALID_CONNECTION_VALIDATION_POLICY");
    this.tools = {};
    for (const check of REQUIRED_CONNECTION_CHECKS) {
      const tool = tools[check];
      if (!tool) continue;
      if (!tool.id.trim() || typeof tool.run !== "function") throw new Error("INVALID_CONNECTION_PROBE_TOOL");
      // Snapshot registration without losing the adapter's method receiver.
      this.tools[check] = { id: tool.id, run: tool.run.bind(tool) };
    }
  }

  async run(environment: ConnectionEnvironment, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const started = this.clock();
    const normalized = this.agent.assess(environment, started).environment;
    const checks: ConnectionEvidence["checks"] = [];
    const missingTools: ConnectionCheck[] = [];
    let evidenceExpiresAt=started.getTime()+this.evidenceLifetimeMs;
    let recipientNeedsInstallation: ConnectionEvidence["recipientNeedsInstallation"] = "unknown";
    for (const check of REQUIRED_CONNECTION_CHECKS) {
      signal?.throwIfAborted();
      const tool = this.tools[check];
      if (!tool) { missingTools.push(check); continue; }
      try {
        const result = await this.probe(tool, normalized, signal);
        if (!result || !["passed", "failed", "restricted"].includes(result.outcome) || typeof result.testReference !== "string" || !result.testReference.trim()) throw new Error("INVALID_PROBE_RESULT");
        if(result.validUntil!==undefined){
          const deadline=typeof result.validUntil==="string"?Date.parse(result.validUntil):NaN;
          if(!Number.isFinite(deadline)||deadline<=started.getTime())throw new Error("INVALID_PROBE_EVIDENCE_DEADLINE");
          evidenceExpiresAt=Math.min(evidenceExpiresAt,deadline);
        }
        checks.push({ check, outcome: result.outcome, testReference: `${tool.id}:${result.testReference}` });
        if (check === "recipient-download" && typeof result.recipientNeedsInstallation === "boolean") recipientNeedsInstallation = result.recipientNeedsInstallation;
      } catch {
        signal?.throwIfAborted();
        checks.push({ check, outcome: "failed", testReference: `${tool.id}:probe-failed-or-timed-out` });
      }
    }
    signal?.throwIfAborted();
    const reviewed = this.clock();
    this.agent.record({ environment: normalized, checkedAt: started.toISOString(), expiresAt: new Date(evidenceExpiresAt).toISOString(), recipientNeedsInstallation, checks }, reviewed);
    return { assessment: this.agent.assess(normalized, reviewed), missingTools };
  }

  private async probe(tool: ConnectionProbeTool, environment: ConnectionEnvironment, external?: AbortSignal) {
    const controller = new AbortController();
    const signal = external ? AbortSignal.any([controller.signal, external]) : controller.signal;
    signal.throwIfAborted();
    let aborted!: () => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      aborted = () => reject(signal.reason);
      signal.addEventListener("abort", aborted, { once: true });
    });
    const timer = setTimeout(() => controller.abort(new Error("CONNECTION_PROBE_TIMEOUT")), this.timeoutMs);
    try {
      return await Promise.race([tool.run(structuredClone(environment), signal), cancelled]);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", aborted);
    }
  }
}
