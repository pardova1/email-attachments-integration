import { randomUUID } from "node:crypto";

export type IntegrityViolationType =
  | "INTEGRITY-WHOLE-FILE-MISMATCH"
  | "INTEGRITY-CHUNK-MISMATCH"
  | "INTEGRITY-MISSING-CHUNK"
  | "INTEGRITY-SIZE-MISMATCH"
  | "INTEGRITY-RECONSTRUCTION-FAILURE";

export type ViolationResolution = "Needs Attention" | "Retrying" | "Corrected";

export interface IntegrityViolation {
  violationId: string;
  transferId: string;
  type: IntegrityViolationType;
  createdAt: Date;
  affectedPart?: number;
  expectedSha256?: string;
  receivedSha256?: string;
  retryCount: number;
  resolution: ViolationResolution;
  details: string;
}

export class IntegrityViolationRegistry {
  private readonly violations = new Map<string, IntegrityViolation>();

  report(input: Omit<IntegrityViolation, "violationId" | "createdAt" | "retryCount" | "resolution">) {
    const violation: IntegrityViolation = {
      ...input,
      violationId: `IV-${randomUUID()}`,
      createdAt: new Date(),
      retryCount: 0,
      resolution: "Needs Attention"
    };
    this.violations.set(violation.violationId, violation);
    return violation;
  }

  get(violationId: string) {
    return this.violations.get(violationId) ?? null;
  }

  forTransfer(transferId: string) {
    return [...this.violations.values()].filter(v => v.transferId === transferId);
  }

  markRetrying(violationId: string) {
    const violation = this.require(violationId);
    violation.retryCount += 1;
    violation.resolution = "Retrying";
    return violation;
  }

  markCorrected(violationId: string) {
    const violation = this.require(violationId);
    violation.resolution = "Corrected";
    return violation;
  }

  private require(violationId: string) {
    const violation = this.violations.get(violationId);
    if (!violation) throw new Error("INTEGRITY_VIOLATION_NOT_FOUND");
    return violation;
  }
}
