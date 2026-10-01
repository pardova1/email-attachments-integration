import type { TransferLane } from "../scaling/transfer-lane.js";
import { StorageDirectorAgent, type FailoverStage } from "./storage-director-agent.js";

export interface StorageRecoveryResult {
  transferId: string;
  laneId: string;
  isolatedToAffectedLane: true;
  activeStorageId: string;
  stages: FailoverStage[];
}

export class StorageRecoveryCoordinator {
  constructor(private readonly director: StorageDirectorAgent) {}

  recoverAffectedLane(lane: TransferLane): StorageRecoveryResult {
    const decision = this.director.analyzeAndCorrect(lane.transferId);
    if (decision.action !== "backup-automatically-activated") {
      throw new Error("BACKUP_RECOVERY_NOT_REQUIRED");
    }

    lane.state = "recovering";

    return {
      transferId: lane.transferId,
      laneId: lane.laneId,
      isolatedToAffectedLane: true,
      activeStorageId: decision.assignment.activeStorageId,
      stages: decision.stages
    };
  }

  markVerifiedExact(lane: TransferLane) {
    if (lane.state !== "recovering") throw new Error("LANE_NOT_RECOVERING");
    lane.state = "complete";
    return { transferId: lane.transferId, laneId: lane.laneId, verifiedExact: true as const };
  }
}
