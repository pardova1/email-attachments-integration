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

  async createForSend(transferId:string, existingLaneId?:string):Promise<PrivateLaneLifecycle> {
    if (this.lanes.has(transferId)) throw new Error("PRIVATE_LANE_ALREADY_EXISTS");
    const laneId=existingLaneId ?? `lane-${randomUUID()}`;
    const crypto=await this.cryptoService.create(transferId,laneId);
    const lifecycle={transferId,laneId,crypto,status:"active" as const,createdAt:new Date().toISOString()};
    this.lanes.set(transferId,lifecycle);
    return structuredClone(lifecycle);
  }

  restoreFromReference(transferId:string,laneId:string,keyReference:string,status:PrivateLaneLifecycleStatus="active") {
    if (this.lanes.has(transferId)) return this.get(transferId)!;
    const crypto=this.cryptoService.rehydrate(transferId,laneId,keyReference);
    const lifecycle={transferId,laneId,crypto,status,createdAt:new Date().toISOString()};
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

  async onExpired(transferId:string, persisted?:{laneId:string;keyReference?:string}) {
    if (!this.lanes.has(transferId) && persisted?.keyReference) {
      this.restoreFromReference(transferId,persisted.laneId,persisted.keyReference,"expired");
    }
    const lane=this.lanes.get(transferId);
    if (lane?.status === "retired") return;
    if (lane) lane.status="expired";
    await this.retire(transferId);
  }

  async retire(transferId:string) {
    const lane=this.lanes.get(transferId);
    if (!lane || lane.status === "retired") return;
    await this.cryptoService.destroy(lane.crypto);
    lane.status="retired";
  }
}
