import { randomUUID } from "node:crypto";
import { HEALTH_PROBE_HEADER, HEALTH_PROBE_VALUE } from "../http/health-contract.js";
import type { ConnectionEnvironment } from "./global-connection-readiness-agent.js";
import type { ConnectionProbeResult, ConnectionProbeTool } from "./global-connection-validation-runner.js";

export interface NetworkProbeReceipt {
  reference: string;
  country: string;
  network: string;
  target: string;
  checkedAt: string;
  outcome: ConnectionProbeResult["outcome"];
  reason: string;
  httpStatus?: number;
}

// Target and vantage are operator configuration, never taken from a sender's request.
export class HttpsConnectionProbe implements ConnectionProbeTool {
  readonly id = "https-service-reachability";
  private readonly target: string;
  private readonly country: string;
  private readonly network: string;
  private readonly receipts = new Map<string, NetworkProbeReceipt>();
  constructor(target: string, vantage: { country: string; network: string }, private readonly request: typeof fetch = globalThis.fetch) {
    const url = new URL(target);
    this.country = vantage.country.trim().toUpperCase();
    this.network = vantage.network;
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !/^[A-Z]{2}$/.test(this.country) || !this.network.trim()) throw new Error("INVALID_NETWORK_PROBE_CONFIGURATION");
    this.target = url.href;
  }

  async run(environment: ConnectionEnvironment, signal: AbortSignal): Promise<ConnectionProbeResult> {
    signal.throwIfAborted();
    let outcome: ConnectionProbeResult["outcome"] = "failed", reason = "VANTAGE_MISMATCH", httpStatus: number | undefined;
    if (environment.country.trim().toUpperCase() === this.country && environment.network === this.network) {
      try {
        const response = await this.request(this.target, { method: "HEAD", redirect: "error", credentials: "omit", cache: "no-store", signal });
        signal.throwIfAborted();
        httpStatus = response.status;
        if (httpStatus === 200 && response.headers.get(HEALTH_PROBE_HEADER) === HEALTH_PROBE_VALUE) {
          outcome = "passed"; reason = "EXPECTED_SERVICE_REACHED";
        } else if (httpStatus === 403 || httpStatus === 451) {
          outcome = "restricted"; reason = "SERVICE_ACCESS_RESTRICTED";
        } else {
          reason = "UNEXPECTED_HEALTH_RESPONSE";
        }
      } catch {
        signal.throwIfAborted();
        reason = "HTTPS_REQUEST_FAILED";
      }
    }
    signal.throwIfAborted();
    const reference = `https-probe:${randomUUID()}`;
    this.receipts.set(reference, { reference, country: this.country, network: this.network, target: this.target, checkedAt: new Date().toISOString(), outcome, reason, httpStatus });
    if (this.receipts.size > 1000) this.receipts.delete(this.receipts.keys().next().value!);
    return { outcome, testReference: reference };
  }

  receipt(reference: string) {
    const receipt = this.receipts.get(reference);
    return receipt ? structuredClone(receipt) : undefined;
  }
}
