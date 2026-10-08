export type PersistedTransferStatus = "created" | "uploading" | "recovering" | "verified" | "available" | "expired";

export interface PersistedTransferState {
  transferId: string;
  /** Canonical private Lane/Tunnel identity. It must survive worker/server replacement. */
  laneId: string;
  /** Reference to protected KMS/HSM material. Never persist the raw encryption key here. */
  keyReference?: string;
  fileName: string;
  contentType: string;
  totalBytes: number;
  chunkBytes: number;
  originalSha256: string;
  senderExpirationConfirmed: boolean;
  createdAt: string;
  status: PersistedTransferStatus;
  confirmedParts: number[];
  partSha256: Record<number, string>;
  activeStorageId?: string;
  /** Last verified resumable byte/part checkpoint; unverified progress must never be trusted. */
  lastVerifiedPart?: number;
  uploadExpiresAt: string;
  downloadAvailableAt?: string;
  downloadExpiresAt?: string;
  updatedAt: string;
  version: number;
}

export interface TransferStateRepository {
  get(transferId: string): Promise<PersistedTransferState | undefined>;
  create(state: PersistedTransferState): Promise<void>;
  save(state: PersistedTransferState, expectedVersion: number): Promise<PersistedTransferState>;
}

export interface TransferExpirationCandidateSource {
  listExpirationCandidates(cutoff: Date, limit: number, afterId?: string): Promise<string[]>;
}

export function assertExpirationBatch(cutoff: Date, limit: number) {
  if (!Number.isFinite(cutoff.getTime()) || !Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error("INVALID_EXPIRATION_BATCH");
  }
}
