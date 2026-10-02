import { IntegrityRecoveryPolicy, type IntegrityRecoveryAssessment, type IntegrityRecoveryAction } from "../integrity/integrity-recovery-policy.js";

export interface RecoveryExecutionPlan {
  transferId: string;
  laneId: string;
  action: IntegrityRecoveryAction;
  automatic: boolean;
  contactUser: boolean;
  preserveVerifiedParts: boolean;
  requireFinalWholeFileVerification: true;
}

export class IntegrityRecoverySupervisor {
  constructor(private readonly policy = new IntegrityRecoveryPolicy()) {}

  plan(transferId: string, laneId: string, assessment: IntegrityRecoveryAssessment): RecoveryExecutionPlan {
    const action = this.policy.decide(assessment);
    return {
      transferId,
      laneId,
      action,
      automatic: action !== "contact-user-last-resort",
      contactUser: action === "contact-user-last-resort",
      preserveVerifiedParts: action !== "restart-transfer-internally",
      requireFinalWholeFileVerification: true
    };
  }
}
