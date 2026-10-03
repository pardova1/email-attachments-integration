import { randomUUID } from "node:crypto";
import { TransferCryptoContextService, type TransferCryptoContext } from "./transfer-crypto-context.js";

export type PrivateLaneLifecycleStatus = "active" | "recovering" | "verified" | "expired" | "retired";

export interface PrivateLaneLifecycle {
  transferId: string;
  laneId: string;
  crypto: TransferCryptoContext;
  status: PrivateLaneLifecycleStatus;
  createdAt: string;
}

export class PrivateLaneLifecycleCoordinator {
  private readonly lanes = new Map<string,PrivateLaneLifecycle>();

  constructor(private readonly cryptoService:TransferCryptoContextService) {}

  async createForSend(transferId:string):Promise<PrivateLaneLifecycle> {
    if (this.lanes.has(transferId)) throw new Error("PRIVATE_LANE_ALREADY_EXISTS");
    const laneId=`lane-${randomUUID()}`;
    const crypto=await this.cryptoService.create(transferId,laneId);
    const lifecycle={transferId,laneId,crypto,status:"active" as const,createdAt:new Date().toISOString()};
    this.lanes.set(transferId,lifecycle);
    return structuredClone(lifecycle);
  }

  get(transferId:string) {
    const lane=this.lanes.get(transferId);
    return lane ? structuredClone(lane) : undefined;
  }

  setStatus(transferId:string,status:PrivateLaneLifecycleStatus) {
    const lane=this.lanes.get(transferId);
    if (!lane) throw new Error("PRIVATE_LANE_NOT_FOUND");
    lane.status=status;
  }

  async retire(transferId:string) {
    const lane=this.lanes.get(transferId);
    if (!lane) return;
    await this.cryptoService.destroy(lane.crypto);
    lane.status="retired";
  }
}
