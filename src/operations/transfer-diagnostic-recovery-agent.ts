export type FaultOwner = "system" | "sender" | "receiver";
export type RecoveryAction = "retry-safe-operation" | "sender-correct-input" | "receiver-correct-access" | "operator-repair";

export interface DiagnosticEvidence {
  code: string;
  scope: "application" | "transfer";
  owner: FaultOwner;
  safeRetryAvailable?: boolean;
}

export interface RecoveryDecision {
  owner: FaultOwner;
  action: RecoveryAction;
  continueUnrelatedTransfers: boolean;
  senderNotice?: string;
  receiverNotice?: string;
}

const senderFixes: Record<string,string> = {
  SENDER_AUTHENTICATION_REQUIRED: "Please sign in again, then resend the email attachment.",
  ACTIVE_LICENSE_REQUIRED: "Please renew or activate your sending license, then resend the email attachment.",
  INVALID_REQUEST: "Please review the attachment details and try sending the email again."
};
const receiverFixes: Record<string,string> = {
  TRANSFER_EXPIRED: "The download window has expired. Please ask the sender to send the file again.",
  RECIPIENT_ACCESS_INVALID: "Please use the newest secure download link from the transfer email and try again."
};

export class TransferDiagnosticRecoveryAgent {
  analyze(e:DiagnosticEvidence):RecoveryDecision {
    if(e.owner==="sender"){
      const fix=senderFixes[e.code] ?? "Please correct the sender-side issue shown in the email and try sending again.";
      return {owner:"sender",action:"sender-correct-input",continueUnrelatedTransfers:true,senderNotice:`We could not complete this transfer. ${fix}`};
    }
    if(e.owner==="receiver"){
      const fix=receiverFixes[e.code] ?? "Please correct the receiver-side access issue and try the download again.";
      return {owner:"receiver",action:"receiver-correct-access",continueUnrelatedTransfers:true,
        senderNotice:`The receiver could not complete this transfer. ${fix}`,
        receiverNotice:`We could not complete your download. ${fix}`};
    }
    return {owner:"system",action:e.safeRetryAvailable?"retry-safe-operation":"operator-repair",continueUnrelatedTransfers:e.scope==="transfer"};
  }
}
