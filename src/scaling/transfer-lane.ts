import { randomUUID } from "node:crypto";

export interface TransferLane {
  laneId: string;
  transferId: string;
  isolationKey: string;
  maxParallelParts: number;
  state: "active" | "recovering" | "complete" | "closed";
  createdAt: Date;
}

export function createTransferLane(transferId: string, maxParallelParts = 8): TransferLane {
  if (!transferId) throw new Error("TRANSFER_ID_REQUIRED");
  if (!Number.isInteger(maxParallelParts) || maxParallelParts < 1) throw new Error("INVALID_PARALLELISM");
  return {
    laneId: `LANE-${randomUUID()}`,
    transferId,
    isolationKey: `transfer:${transferId}`,
    maxParallelParts,
    state: "active",
    createdAt: new Date()
  };
}

export interface LaneScheduler {
  reserve(lane: TransferLane): Promise<void>;
  release(laneId: string): Promise<void>;
  availableCapacity(): Promise<number>;
}

// A lane is logical isolation, not a claim of physically dedicated internet
// infrastructure. Production schedulers allocate shared scalable capacity while
// keeping transfer state, retries, integrity checks and work independent.
