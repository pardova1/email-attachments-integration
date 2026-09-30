import { FILE_INTEGRITY_COMMAND } from "../domain/file-integrity-command.js";

export type Specialist =
  | "transfer"
  | "recovery"
  | "integrity"
  | "security"
  | "delivery"
  | "compatibility"
  | "infrastructure";

export interface SupervisorTask {
  transferId: string;
  kind: "send" | "receive" | "recover" | "verify" | "secure" | "deliver" | "compatibility" | "infrastructure";
  requiresUserAuthorization?: boolean;
}

export interface DelegationDecision {
  specialist: Specialist;
  runBehindScenes: boolean;
  fileMutationAllowed: false;
}

export class OperationsSupervisorAgent {
  delegate(task: SupervisorTask): DelegationDecision {
    const specialist: Specialist =
      task.kind === "recover" ? "recovery" :
      task.kind === "verify" ? "integrity" :
      task.kind === "secure" ? "security" :
      task.kind === "deliver" ? "delivery" :
      task.kind === "compatibility" ? "compatibility" :
      task.kind === "infrastructure" ? "infrastructure" : "transfer";

    return {
      specialist,
      runBehindScenes: !task.requiresUserAuthorization,
      fileMutationAllowed: FILE_INTEGRITY_COMMAND.allowMutation
    };
  }
}
