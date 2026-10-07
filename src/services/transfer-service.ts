import { createTransfer, expectedPartCount, progress, TRANSFER_EXPIRATION_MS, type TransferSession } from "../domain/transfer.js";
import { assertVerifiedExact } from "../domain/file-integrity-command.js";
import type { StoragePort } from "../ports/storage.js";
import type { TransferStateRepository } from "../ports/transfer-state-repository.js";
import { IntegrityViolationRegistry } from "../integrity/violation-registry.js";
import { createTransferLane, type TransferLane } from "../scaling/transfer-lane.js";
import { DurableTransferStateService } from "./durable-transfer-state-service.js";

export interface TransferRestoreObserver {\n  onRestored(state: { transferId: string; laneId: string; keyReference?: string; status: string }): Promise<void> | void;\n}\n\nexport interface TransferExpirationObserver {
  onExpired(transferId: string): Promise<void>;
}

export class TransferService {
  private readonly sessions = new Map<string, TransferSession>();
  private readonly lanes = new Map<string, TransferLane>();
  private readonly durable?: DurableTransferStateService;

  constructor(
    private readonly storage: StoragePort,
    private readonly violations = new IntegrityViolationRegistry(),
    repository?: TransferStateRepository,
    private readonly expirationObserver?: TransferExpirationObserver
  ) {
    this.durable = repository ? new DurableTransferStateService(repository) : undefined;
  }

  create(input: { fileName: string; contentType: string; totalBytes: number; chunkBytes?: number; originalSha256: string; senderExpirationConfirmed: boolean }) {
    const session = createTransfer(input);
    this.sessions.set(session.id, session);
    this.lanes.set(session.id, createTransferLane(session.id));
    return session;
  }

  async createDurable(input: Parameters<TransferService["create"]>[0]) {
    const session = this.create(input);
    try {
      await this.persistCreated(session.id);
      return session;
    } catch (error) {
      this.sessions.delete(session.id);
      this.lanes.delete(session.id);
      throw error;
    }
  }

  async persistKeyReference(id: string, keyReference: string) {
    if (!this.durable) return;
    await this.durable.setKeyReference(id, keyReference);
  }

  async persistCreated(id: string) {
    if (!this.durable) return;
    const session = this.requireCached(id);
    const lane = this.requireCachedLane(id);
    await this.durable.create(session, lane);
  }

  async restore(id: string) {
    if (!this.durable) throw new Error("TRANSFER_STATE_REPOSITORY_REQUIRED");
    const restored = await this.durable.restore(id);
    const activeExpiry = restored.session.status === "complete"
      ? restored.session.downloadExpiresAt
      : restored.session.uploadExpiresAt;
    if (activeExpiry && activeExpiry.getTime() <= Date.now()) {
      restored.session.status = "expired";
      await this.durable.expire(id);
      await this.storage.purge(id);
      await this.expirationObserver?.onExpired(id);
      throw new Error("TRANSFER_EXPIRED");
    }
    this.sessions.set(id, restored.session);
    this.lanes.set(id, restored.lane);
    return restored.session;
  }

  get(id: string) {
    const session = this.requireCached(id);
    const activeExpiry = session.status === "complete" ? session.downloadExpiresAt : session.uploadExpiresAt;
    if (activeExpiry && activeExpiry.getTime() <= Date.now()) {
      session.status = "expired";
      throw new Error("TRANSFER_EXPIRED");
    }
    return session;
  }

  async expireIfNeeded(id: string) {
    const session = this.requireCached(id);
    const activeExpiry = session.status === "complete" ? session.downloadExpiresAt : session.uploadExpiresAt;
    if (!activeExpiry || activeExpiry.getTime() > Date.now()) return false;
    session.status = "expired";
    if (this.durable) await this.durable.expire(id);
    await this.storage.purge(id);
    await this.expirationObserver?.onExpired(id);
    return true;
  }

  async ensureLoaded(id: string) {
    if (!this.sessions.has(id)) await this.restore(id);
    return this.get(id);
  }

  async uploadPart(id: string, partNumber: number, data: Buffer) {
    const session = await this.ensureLoaded(id); const totalParts = expectedPartCount(session);
    if (session.status === "complete") throw new Error("TRANSFER_ALREADY_COMPLETE");
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > totalParts) throw new Error("INVALID_PART_NUMBER");
    await this.storage.putPart(id, partNumber, data);
    session.receivedParts.add(partNumber); session.status = "uploading";
    await this.persistMutation(session);
    return progress(session);
  }

  async complete(id: string) {
    const session = await this.ensureLoaded(id); const totalParts = expectedPartCount(session);
    if (session.receivedParts.size !== totalParts) throw new Error("TRANSFER_INCOMPLETE");
    const stored = await this.storage.complete(id, totalParts);
    try {
      assertVerifiedExact(session.originalSha256, stored.sha256);
    } catch {
      const violation = this.violations.report({
        transferId: session.id,
        type: "INTEGRITY-WHOLE-FILE-MISMATCH",
        expectedSha256: session.originalSha256,
        receivedSha256: stored.sha256,
        details: "Completed bytes do not match sender original. Transfer must be recovered and verified again."
      });
      throw new Error(`FILE_INTEGRITY_COMMAND_VIOLATION:${violation.violationId}`);
    }
    const downloadAvailableAt = new Date();
    session.downloadAvailableAt = downloadAvailableAt;
    session.downloadExpiresAt = new Date(downloadAvailableAt.getTime() + TRANSFER_EXPIRATION_MS);
    session.status = "complete";
    const lane = this.requireCachedLane(session.id);
    lane.state = "complete";
    await this.persistMutation(session);
    return { ...stored, status: session.status, verifiedExact: true as const, downloadAvailableAt: session.downloadAvailableAt, downloadExpiresAt: session.downloadExpiresAt };
  }

  lane(id: string) {
    this.get(id);
    return this.requireCachedLane(id);
  }

  integrityViolations(id: string) {
    this.get(id);
    return this.violations.forTransfer(id);
  }

  status(id: string) {
    const session = this.get(id);
    return { id, status: session.status, ...progress(session), uploadExpiresAt: session.uploadExpiresAt, downloadAvailableAt: session.downloadAvailableAt, downloadExpiresAt: session.downloadExpiresAt };
  }

  private requireCached(id: string) {
    const session = this.sessions.get(id);
    if (!session) throw new Error("TRANSFER_NOT_LOADED");
    return session;
  }

  private requireCachedLane(id: string) {
    const lane = this.lanes.get(id);
    if (!lane) throw new Error("TRANSFER_LANE_NOT_FOUND");
    return lane;
  }

  private async persistMutation(session: TransferSession) {
    if (!this.durable) return;
    await this.durable.save(session, this.requireCachedLane(session.id));
  }
}
