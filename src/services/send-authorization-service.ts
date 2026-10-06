import type { EntitlementService } from "../billing/entitlement-service.js";
import type { TransferService } from "./transfer-service.js";

export class SendAuthorizationService {
  constructor(
    private readonly entitlements: EntitlementService,
    private readonly transfers: TransferService
  ) {}

  async createForValidUser(userId: string, input: Parameters<TransferService["create"]>[0], now = new Date()) {
    await this.entitlements.requireActive(userId, now);
    const transfer = this.transfers.create(input);
    await this.transfers.persistCreated(transfer.id);
    return transfer;
  }
}
