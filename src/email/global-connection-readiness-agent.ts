export const REQUIRED_CONNECTION_CHECKS = [
  "dns-tls", "email-delivery", "attachment-integration", "upload", "recipient-download", "file-integrity"
] as const;
export type ConnectionCheck = typeof REQUIRED_CONNECTION_CHECKS[number];

export interface ConnectionEnvironment {
  country: string;
  network: string;
  provider: string;
  client: string;
  platform: string;
  softwareVersion: string;
}

export interface ConnectionEvidence {
  environment: ConnectionEnvironment;
  checkedAt: string;
  expiresAt: string;
  recipientNeedsInstallation: boolean;
  checks: { check: ConnectionCheck; outcome: "passed" | "failed" | "restricted"; testReference: string }[];
}

const MAX_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1000;

// Evaluates supplied test evidence. Discovery and live probes must be supplied by
// production tools; a country name or generic protocol capability proves no access.
export class GlobalConnectionReadinessAgent {
  private readonly evidence = new Map<string, ConnectionEvidence>();

  private normalize(environment: ConnectionEnvironment): ConnectionEnvironment {
    const normalized = { ...environment, country: environment.country.trim().toUpperCase() };
    if (!/^[A-Z]{2}$/.test(normalized.country) || Object.values(normalized).some(value => !value.trim())) {
      throw new Error("CONNECTION_ENVIRONMENT_REQUIRED");
    }
    return normalized;
  }

  private key(environment: ConnectionEnvironment) {
    const value = this.normalize(environment);
    return JSON.stringify([value.country, value.network, value.provider, value.client, value.platform, value.softwareVersion]);
  }

  record(input: ConnectionEvidence, now = new Date()) {
    const checked = Date.parse(input.checkedAt), expires = Date.parse(input.expiresAt);
    if (!Number.isFinite(now.getTime()) || !Number.isFinite(checked) || !Number.isFinite(expires) || checked > now.getTime() || expires <= checked || expires - checked > MAX_EVIDENCE_AGE_MS) {
      throw new Error("INVALID_CONNECTION_EVIDENCE_WINDOW");
    }
    const checks = new Set<ConnectionCheck>();
    for (const result of input.checks) {
      if (!REQUIRED_CONNECTION_CHECKS.includes(result.check) || checks.has(result.check) || !result.testReference.trim() || !["passed", "failed", "restricted"].includes(result.outcome)) {
        throw new Error("INVALID_CONNECTION_TEST_EVIDENCE");
      }
      checks.add(result.check);
    }
    const environment = this.normalize(input.environment);
    const key = this.key(environment);
    const previous = this.evidence.get(key);
    if (previous && Date.parse(previous.checkedAt) > checked) throw new Error("STALE_CONNECTION_EVIDENCE");
    this.evidence.set(key, structuredClone({ ...input, environment }));
  }

  assess(environment: ConnectionEnvironment, now = new Date()) {
    if (!Number.isFinite(now.getTime())) throw new Error("INVALID_CONNECTION_REVIEW_TIME");
    const normalized = this.normalize(environment);
    const evidence = this.evidence.get(this.key(normalized));
    const current = evidence && Date.parse(evidence.checkedAt) <= now.getTime() && Date.parse(evidence.expiresAt) > now.getTime();
    if (!current) {
      return { environment: normalized, status: "unverified" as const, requiredChecks: [...REQUIRED_CONNECTION_CHECKS], reasons: [evidence ? "EVIDENCE_EXPIRED" : "NO_ENVIRONMENT_TEST_EVIDENCE"] };
    }
    const requiredChecks = REQUIRED_CONNECTION_CHECKS.filter(check => !evidence.checks.some(result => result.check === check && result.outcome === "passed"));
    const restricted = evidence.checks.some(result => result.outcome === "restricted");
    const reasons = requiredChecks.map(check => `CHECK_REQUIRED:${check}`);
    if (evidence.recipientNeedsInstallation) reasons.push("RECIPIENT_INSTALLATION_REQUIRED");
    const status = restricted ? "restricted" as const : reasons.length ? "not-ready" as const : "verified" as const;
    return { environment: normalized, status, requiredChecks, reasons, checkedAt: evidence.checkedAt, expiresAt: evidence.expiresAt };
  }
}
