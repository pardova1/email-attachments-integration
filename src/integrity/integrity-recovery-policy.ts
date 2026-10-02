export type IntegrityRecoveryAction =
  | "continue-from-verified-checkpoint"
  | "retransmit-affected-parts"
  | "restart-transfer-internally"
  | "contact-user-last-resort";

export interface IntegrityRecoveryAssessment {
  checkpointVerified: boolean;
  alteredParts: number[];
  originalBytesAvailable: boolean;
  affectedPartsRecoverable: boolean;
  automatedRecoveryExhausted: boolean;
}

export class IntegrityRecoveryPolicy {
  decide(input: IntegrityRecoveryAssessment): IntegrityRecoveryAction {
    if (input.checkpointVerified && input.alteredParts.length === 0) {
      return "continue-from-verified-checkpoint";
    }

    if (input.originalBytesAvailable && input.alteredParts.length > 0 && input.affectedPartsRecoverable) {
      return "retransmit-affected-parts";
    }

    if (input.originalBytesAvailable && !input.automatedRecoveryExhausted) {
      return "restart-transfer-internally";
    }

    return "contact-user-last-resort";
  }
}
