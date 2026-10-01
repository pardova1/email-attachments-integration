import { randomUUID } from "node:crypto";
import { createTransferLane, type TransferLane } from "../scaling/transfer-lane.js";
import { StorageDirectorAgent, type StorageArea, type StorageAssignment } from "../storage/storage-director-agent.js";

export interface RoutedEmailTransfer {
  transferLabel: string;
  transferId: string;
  lane: TransferLane;
  storage: StorageAssignment;
  objective: "fastest-secure-eligible-delivery";
}

export class TransferRoutingAgent {
  constructor(private readonly storageDirector: StorageDirectorAgent) {}

  assign(input: {
    transferId: string;
    totalBytes: number;
    storageAreas: StorageArea[];
  }): RoutedEmailTransfer {
    const lane = createTransferLane(input.transferId);
    const storage = this.storageDirector.organizeTransfer({
      transferId: input.transferId,
      laneId: lane.laneId,
      requiredBytes: input.totalBytes,
      areas: input.storageAreas
    });

    return {
      transferLabel: `EMAIL-TRANSFER-${randomUUID()}`,
      transferId: input.transferId,
      lane,
      storage,
      objective: "fastest-secure-eligible-delivery"
    };
  }
}
