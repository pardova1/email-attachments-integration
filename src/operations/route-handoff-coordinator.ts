export interface TransferCheckpoint {
  transferId: string;
  laneId: string;
  confirmedParts: number[];
  partSha256: Record<number, string>;
  sourceStorageId: string;
}

export interface RouteHandoffResult {
  transferId: string;
  laneId: string;
  fromStorageId: string;
  toStorageId: string;
  resumeAfterPart: number;
  verifiedCheckpoint: true;
  unrelatedLanesAffected: false;
}

export class RouteHandoffCoordinator {
  prepare(checkpoint: TransferCheckpoint, targetStorageId: string): RouteHandoffResult {
    if (!targetStorageId || targetStorageId === checkpoint.sourceStorageId) {
      throw new Error("INVALID_ROUTE_HANDOFF_TARGET");
    }

    const parts = [...checkpoint.confirmedParts].sort((a, b) => a - b);
    for (const part of parts) {
      if (!checkpoint.partSha256[part]) throw new Error("CHECKPOINT_INTEGRITY_MISSING");
    }

    return {
      transferId: checkpoint.transferId,
      laneId: checkpoint.laneId,
      fromStorageId: checkpoint.sourceStorageId,
      toStorageId: targetStorageId,
      resumeAfterPart: parts.at(-1) ?? 0,
      verifiedCheckpoint: true,
      unrelatedLanesAffected: false
    };
  }
}
