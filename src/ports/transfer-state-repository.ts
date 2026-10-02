export type PersistedTransferStatus = "uploading" | "recovering" | "verified" | "available" | "expired";

export interface PersistedTransferState {
  transferId: string;
  laneId: string;
  status: PersistedTransferStatus;
  originalSha256: string;
  totalBytes: number;
  confirmedParts: number[];
  partSha256: Record<number, string>;
  activeStorageId?: string;
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
