export interface ChangeEvaluation {
  compatible: boolean;
  integrityVerified: boolean;
  issues: string[];
}

export interface ChangeLifecyclePort {
  evaluateBefore(): Promise<ChangeEvaluation>;
  execute(): Promise<void>;
  evaluateAfter(): Promise<ChangeEvaluation>;
}

export interface ChangeLifecycleResult {
  status: "approved" | "blocked";
  stage: "pre-change" | "execution" | "post-change" | "complete";
  issues: string[];
}

export class PrePostChangeEvaluationGuard {
  async run(port: ChangeLifecyclePort): Promise<ChangeLifecycleResult> {
    const before = await port.evaluateBefore();
    if (!before.compatible || !before.integrityVerified || before.issues.length) {
      return { status: "blocked", stage: "pre-change", issues: before.issues.length ? before.issues : ["PRE_CHANGE_EVALUATION_FAILED"] };
    }

    try {
      await port.execute();
    } catch {
      return { status: "blocked", stage: "execution", issues: ["CHANGE_EXECUTION_FAILED"] };
    }

    const after = await port.evaluateAfter();
    if (!after.compatible || !after.integrityVerified || after.issues.length) {
      return { status: "blocked", stage: "post-change", issues: after.issues.length ? after.issues : ["POST_CHANGE_EVALUATION_FAILED"] };
    }

    return { status: "approved", stage: "complete", issues: [] };
  }
}
