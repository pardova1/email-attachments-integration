export type PersistedTransferStatus = "uploading" | "recovering" | "verified" | "available" | "expired";

export interface PersistedTransferState {
  transferId: string;
  /** Canonical private Lane/Tunnel identity. It must survive worker/server replacement. */
  laneId: string;
  /** Reference to protected KMS/HSM material. Never persist the raw encryption key here. */
  keyReference?: string;
  status: PersistedTransferStatus;
  originalSha256: string;
  totalBytes: number;
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
