import type { IntegrityViolationRegistry } from "./violation-registry.js";
import type { OperationsRecoveryAgent, RecoveryDecision } from "../operations/recovery-agent.js";

export interface IntegrityRecoveryPlan {
  violationId: string;
  transferId: string;
  decision: RecoveryDecision;
  resolution: "Retrying" | "Needs Attention";
}

export class IntegrityRecoveryCoordinator {
  constructor(
    private readonly violations: IntegrityViolationRegistry,
    private readonly recovery: OperationsRecoveryAgent
  ) {}

  plan(violationId: string, transferExpired = false): IntegrityRecoveryPlan {
    const violation = this.violations.get(violationId);
    if (!violation) throw new Error("INTEGRITY_VIOLATION_NOT_FOUND");

    const decision = this.recovery.diagnose({
      transferId: violation.transferId,
      kind: "checksum",
      attempt: violation.retryCount,
      transferExpired
    });

    if (decision.action === "escalate") {
      return { violationId, transferId: violation.transferId, decision, resolution: "Needs Attention" };
    }

    const updated = this.violations.markRetrying(violationId);
    return { violationId, transferId: violation.transferId, decision, resolution: updated.resolution as "Retrying" };
  }

  corrected(violationId: string) {
    return this.violations.markCorrected(violationId);
  }
}
