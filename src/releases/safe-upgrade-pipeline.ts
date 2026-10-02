import type { UpgradeCandidate } from "../research/transfer-research-agent.js";

export type UpgradeStage =
  | "research-validated"
  | "compatibility-checked"
  | "isolated-test"
  | "limited-rollout"
  | "production-approved"
  | "rolled-back";

export interface UpgradeEvidence {
  compatibilityPassed: boolean;
  exactIntegrityPassed: boolean;
  activeLaneIsolationPassed: boolean;
  securityPassed: boolean;
  performanceRegression: boolean;
}

export class SafeUpgradePipeline {
  evaluate(candidate: UpgradeCandidate, evidence: UpgradeEvidence): UpgradeStage {
    if (
      !evidence.compatibilityPassed ||
      !evidence.exactIntegrityPassed ||
      !evidence.activeLaneIsolationPassed ||
      !evidence.securityPassed ||
      evidence.performanceRegression
    ) return "rolled-back";

    if (
      candidate.mayModifyUserFileBytes ||
      candidate.mayBypassSecurity ||
      candidate.mayDisruptActiveTransfers
    ) return "rolled-back";

    return "production-approved";
  }
}
