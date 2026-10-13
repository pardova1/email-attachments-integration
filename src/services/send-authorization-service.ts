import type { EntitlementService } from "../billing/entitlement-service.js";
import type { PrivateLaneLifecycleCoordinator } from "../security/private-lane-lifecycle-coordinator.js";
import type { TransferService } from "./transfer-service.js";
import {isLicenseActive,type LicenseCheckTime} from "../billing/annual-license.js";

export class SendAuthorizationService {
  constructor(
    private readonly entitlements: EntitlementService,
    private readonly transfers: TransferService,
    private readonly privateLanes?: PrivateLaneLifecycleCoordinator
  ) {}

  async createForValidUser(userId: string, input: Parameters<TransferService["create"]>[0], now:LicenseCheckTime = ()=>new Date(), beforeCreate?:()=>void) {
    const license=await this.entitlements.requireActive(userId, now);
    beforeCreate?.();
    // No further await between this final time check and starting creation.
    if(license.userId!==userId||!isLicenseActive(license,typeof now==="function"?now():now))throw new Error("ACTIVE_LICENSE_REQUIRED");
    const transfer = await this.transfers.createDurable(input);
    if (!this.privateLanes) return transfer;
    try {
      const lifecycle = await this.privateLanes.createForSend(transfer.id, this.transfers.lane(transfer.id).laneId);
      await this.transfers.persistKeyReference(transfer.id, lifecycle.crypto.keyReference);
      return transfer;
    } catch (error) {
      await this.privateLanes.retire(transfer.id);
      throw error;
    }
  }
}
