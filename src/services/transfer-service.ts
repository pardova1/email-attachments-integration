import { createTransfer, expectedPartCount, progress, TRANSFER_EXPIRATION_MS, type TransferSession } from "../domain/transfer.js";
import { assertVerifiedExact } from "../domain/file-integrity-command.js";
import type { StoragePort } from "../ports/storage.js";
import type { TransferStateRepository } from "../ports/transfer-state-repository.js";
import { IntegrityViolationRegistry } from "../integrity/violation-registry.js";
import { createTransferLane, type TransferLane } from "../scaling/transfer-lane.js";
import { DurableTransferStateService } from "./durable-transfer-state-service.js";

export interface TransferRestoreObserver {
  onRestored(state: { transferId: string; laneId: string; keyReference?: string; status: string }): Promise<void> | void;
}

export interface TransferExpirationObserver {
  onExpired(transferId: string, crypto?: { laneId: string; keyReference?: string }): Promise<void>;
}

type CompletionResult = Awaited<ReturnType<StoragePort["complete"]>> & {
  status: "complete"; verifiedExact: true; downloadAvailableAt: Date; downloadExpiresAt: Date;
};

export class TransferService {
  private readonly sessions = new Map<string, TransferSession>();
  private readonly lanes = new Map<string, TransferLane>();
  private readonly durable?: DurableTransferStateService;
  private readonly completions = new Map<string, Promise<CompletionResult>>();

  constructor(
    private readonly storage: StoragePort,
    private readonly violations = new IntegrityViolationRegistry(),
    repository?: TransferStateRepository,
    private readonly expirationObserver?: TransferExpirationObserver,
    private readonly restoreObserver?: TransferRestoreObserver
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
    const activeExpiry = restored.session.downloadExpiresAt ?? restored.session.uploadExpiresAt;
    if (restored.session.status === "expired" || activeExpiry.getTime() <= Date.now()) {
      // Reread/version-check the deadline before cleanup: another worker may have completed meanwhile.
      if (!await this.cleanupExpired(id)) throw new Error("TRANSFER_STATE_CHANGED_RETRY_REQUIRED");
      throw new Error("TRANSFER_EXPIRED");
    }
    await this.restoreObserver?.onRestored({
      transferId: restored.persisted.transferId,
      laneId: restored.persisted.laneId,
      keyReference: restored.persisted.keyReference,
      status: restored.persisted.status
    });
    const session = this.sessions.get(id) ?? restored.session;
    Object.assign(session, restored.session);
    this.sessions.set(id, session);
    this.lanes.set(id, restored.lane);
    return session;
  }

  get(id: string) {
    const session = this.requireCached(id);
    const activeExpiry = session.downloadExpiresAt ?? session.uploadExpiresAt;
    if (session.status === "expired" || activeExpiry.getTime() <= Date.now()) {
      session.status = "expired";
      throw new Error("TRANSFER_EXPIRED");
    }
    return session;
  }

  async expireIfNeeded(id: string) {
    if (this.durable) return this.cleanupExpired(id);
    const session = this.requireCached(id);
    const activeExpiry = session.downloadExpiresAt ?? session.uploadExpiresAt;
    if (session.status !== "expired" && activeExpiry.getTime() > Date.now()) return false;
    session.status = "expired";
    await this.storage.purge(id);
    await this.expirationObserver?.onExpired(id);
    return true;
  }

  async ensureLoaded(id: string) {
    if (!this.sessions.has(id)) await this.restore(id);
    return this.get(id);
  }

  async refresh(id: string) {
    if (!this.durable) return this.ensureLoaded(id);
    try { return await this.restore(id); }
    catch (error) {
      this.sessions.delete(id);
      this.lanes.delete(id);
      throw error;
    }
  }

  async cleanupExpired(id: string, cutoff = new Date()) {
    if (!this.durable) throw new Error("TRANSFER_STATE_REPOSITORY_REQUIRED");
    const state = await this.durable.expireIfDue(id, cutoff);
    if (!state) return false;
    const cached = this.sessions.get(id);
    if (cached) cached.status = "expired";
    await this.storage.purge(id);
    await this.expirationObserver?.onExpired(id, { laneId: state.laneId, keyReference: state.keyReference });
    this.sessions.delete(id);
    this.lanes.delete(id);
    return true;
  }

  async uploadPart(id: string, partNumber: number, data: Buffer) {
    const session = await this.refresh(id); const totalParts = expectedPartCount(session);
    if (session.status === "complete") throw new Error("TRANSFER_ALREADY_COMPLETE");
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > totalParts) throw new Error("INVALID_PART_NUMBER");
    const expectedBytes = Math.min(session.chunkBytes, session.totalBytes - (partNumber - 1) * session.chunkBytes);
    if (data.length !== expectedBytes) throw new Error("INVALID_PART_SIZE");
    await this.storage.putPart(id, partNumber, data);
    if (this.get(id).status === "complete") throw new Error("TRANSFER_ALREADY_COMPLETE");
    if ((await this.refresh(id)).status === "complete") throw new Error("TRANSFER_ALREADY_COMPLETE");
    const next: TransferSession = { ...session, status: "uploading", receivedParts: new Set([...session.receivedParts, partNumber]) };
    if (this.durable) {
      try {
        const saved = await this.durable.save(next, this.requireCachedLane(id));
        next.receivedParts = new Set(saved.confirmedParts);
      } catch (error) {
        if (error instanceof Error && error.message === "TRANSFER_EXPIRED") session.status = "expired";
        throw error;
      }
    }
    // Publish progress only after its save succeeds; preserve other local successful uploads.
    session.receivedParts = new Set([...session.receivedParts, ...next.receivedParts]);
    session.status = "uploading";
    return progress(session);
  }

  async complete(id: string) {
    const existing = this.completions.get(id);
    if (existing) return existing;
    const pending = this.completeOnce(id);
    this.completions.set(id, pending);
    try { return await pending; }
    finally { this.completions.delete(id); }
  }

  private async completeOnce(id: string): Promise<CompletionResult> {
    const session = await this.ensureLoaded(id); const totalParts = expectedPartCount(session);
    if (this.durable) {
      const latest = await this.durable.restore(id);
      if (latest.session.status === "expired") {
        session.status = "expired";
        throw new Error("TRANSFER_EXPIRED");
      }
      session.receivedParts = latest.session.receivedParts;
      if (latest.session.status === "complete") {
        session.status = "complete";
        session.downloadAvailableAt = latest.session.downloadAvailableAt;
        session.downloadExpiresAt = latest.session.downloadExpiresAt;
      }
      this.get(id);
    }
    if (session.receivedParts.size !== totalParts) throw new Error("TRANSFER_INCOMPLETE");
    const stored = await this.storage.complete(id, totalParts);
    try {
      assertVerifiedExact(session.originalSha256, stored.sha256);
      if (stored.totalBytes !== session.totalBytes) throw new Error("FILE_BYTE_COUNT_MISMATCH");
    } catch {
      const violation = this.violations.report({
        transferId: session.id,
        type: stored.totalBytes !== session.totalBytes ? "INTEGRITY-SIZE-MISMATCH" : "INTEGRITY-WHOLE-FILE-MISMATCH",
        expectedSha256: session.originalSha256,
        receivedSha256: stored.sha256,
        details: "Completed bytes or byte count do not match sender original. Transfer must be recovered and verified again."
      });
      throw new Error(`FILE_INTEGRITY_COMMAND_VIOLATION:${violation.violationId}`);
    }
    // Verification can take time: recheck expiration before starting any download window.
    this.get(id);
    let downloadAvailableAt = session.downloadAvailableAt ?? new Date();
    let downloadExpiresAt = session.downloadExpiresAt ?? new Date(downloadAvailableAt.getTime() + TRANSFER_EXPIRATION_MS);
    const lane = this.requireCachedLane(session.id);
    if (this.durable) {
      const saved = await this.durable.save(
        { ...session, status: "complete", downloadAvailableAt, downloadExpiresAt },
        { ...lane, state: "complete" }
      );
      if (!saved.downloadAvailableAt || !saved.downloadExpiresAt) throw new Error("DOWNLOAD_WINDOW_NOT_READY");
      downloadAvailableAt = new Date(saved.downloadAvailableAt);
      downloadExpiresAt = new Date(saved.downloadExpiresAt);
    }
    if (downloadExpiresAt.getTime() <= Date.now()) throw new Error("TRANSFER_EXPIRED");
    session.downloadAvailableAt = downloadAvailableAt;
    session.downloadExpiresAt = downloadExpiresAt;
    session.status = "complete";
    lane.state = "complete";
    return { ...stored, status: "complete", verifiedExact: true, downloadAvailableAt, downloadExpiresAt };
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

}
