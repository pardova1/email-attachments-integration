import type { EntitlementService } from "../billing/entitlement-service.js";
import type { PrivateLaneLifecycleCoordinator } from "../security/private-lane-lifecycle-coordinator.js";
import type { TransferService } from "./transfer-service.js";

export class SendAuthorizationService {
  constructor(
    private readonly entitlements: EntitlementService,
    private readonly transfers: TransferService,
    private readonly privateLanes?: PrivateLaneLifecycleCoordinator
  ) {}

  async createForValidUser(userId: string, input: Parameters<TransferService["create"]>[0], now = new Date()) {
    await this.entitlements.requireActive(userId, now);
    const transfer = await this.transfers.createDurable(input);
    if (!this.privateLanes) return transfer;
    try {
      await this.privateLanes.createForSend(transfer.id, this.transfers.lane(transfer.id).laneId);
      return transfer;
    } catch (error) {
      await this.privateLanes.retire(transfer.id);
      throw error;
    }
  }
}
