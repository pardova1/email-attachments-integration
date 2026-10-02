export type LaneAccessPurpose =
  | "sender-upload"
  | "receiver-download"
  | "automated-recovery"
  | "integrity-verification"
  | "business-metadata-oversight";

export interface LaneIdentity {
  transferId: string;
  laneId: string;
  senderSubjectId: string;
  receiverSubjectId: string;
}

export interface LaneAccessRequest {
  transferId: string;
  laneId: string;
  subjectId: string;
  purpose: LaneAccessPurpose;
}

export interface LaneAccessDecision {
  allowed: boolean;
  payloadAccess: boolean;
  reason: string;
}

export class LaneAccessGuard {
  authorize(lane: LaneIdentity, request: LaneAccessRequest): LaneAccessDecision {
    if (request.transferId !== lane.transferId || request.laneId !== lane.laneId) {
      return { allowed:false, payloadAccess:false, reason:"lane-identity-mismatch" };
    }

    if (request.purpose === "business-metadata-oversight") {
      return { allowed:true, payloadAccess:false, reason:"metadata-only" };
    }

    if (request.purpose === "sender-upload" && request.subjectId === lane.senderSubjectId) {
      return { allowed:true, payloadAccess:true, reason:"authorized-sender" };
    }

    if (request.purpose === "receiver-download" && request.subjectId === lane.receiverSubjectId) {
      return { allowed:true, payloadAccess:true, reason:"authorized-receiver" };
    }

    if (request.purpose === "automated-recovery" || request.purpose === "integrity-verification") {
      // Production callers must additionally present a scoped service identity.
      return { allowed:true, payloadAccess:true, reason:"scoped-transfer-operation" };
    }

    return { allowed:false, payloadAccess:false, reason:"not-authorized-for-private-lane" };
  }
}
