export type RecoveryAction =
  | "retry-part"
  | "resume-transfer"
  | "verify-integrity"
  | "refresh-access"
  | "escalate"
  | "none";

export interface OperationalIncident {
  transferId: string;
  kind: "network" | "timeout" | "checksum" | "authorization" | "storage" | "unknown";
  attempt: number;
  transferExpired: boolean;
}

export interface RecoveryDecision {
  action: RecoveryAction;
  retryAfterMs?: number;
  reason: string;
}

export class OperationsRecoveryAgent {
  constructor(private readonly maxAutomaticAttempts = 5) {}

  diagnose(incident: OperationalIncident): RecoveryDecision {
    if (incident.transferExpired) {
      return { action: "escalate", reason: "Transfer window expired; automatic recovery must not bypass expiration policy." };
    }
    if (incident.attempt >= this.maxAutomaticAttempts) {
      return { action: "escalate", reason: "Automatic recovery attempt limit reached." };
    }

    switch (incident.kind) {
      case "network":
      case "timeout":
        return {
          action: "retry-part",
          retryAfterMs: Math.min(30_000, 1_000 * 2 ** incident.attempt),
          reason: "Transient transport failure."
        };
      case "checksum":
        return { action: "verify-integrity", reason: "Transferred bytes failed integrity verification." };
      case "authorization":
        return { action: "refresh-access", reason: "Transfer authorization needs renewal within the active window." };
      case "storage":
        return { action: "resume-transfer", reason: "Transport storage operation failed; resume from confirmed parts." };
      default:
        return { action: "escalate", reason: "Unknown failure requires operator review." };
    }
  }
}
